import { DeepReadonly } from "fvtt-types/utils";
import { SYSTEM_NAME, FLAGS } from "../constants";
import { StorageFlow } from "@/module/flows/StorageFlow";
import { RiggerFlow } from "@/module/flows/RiggerFlow";

/**
 * A completed action phase's endpoint in a token's recorded movement history.
 * The index is guarded by movementId when rendered, so markers naturally become
 * inert if an undo replaces or truncates the history.
 */
export type MovementPhaseMarker = {
    combatId: string;
    round: number;
    pass: number;
    waypointIndex: number;
    movementId: string;
};

/**
 * A custom TokenDocument class for the SR5 system.
 * It extends the base functionality to handle system-specific movement rules and data cleanup.
 */
export class SR5TokenDocument extends TokenDocument {
    /**
     * Tracks if a movement operation is in progress to prevent visual flicker in `measureMovementPath`.
     * @private
     */
    #movementInProgress = false;

    override async _preUpdate(...args: Parameters<TokenDocument['_preUpdate']>) {
        const [changes, options] = args;
        // Companion tokens cannot be moved directly (lockstep sync with leader)
        const isCompanion = Boolean(this.getFlag('shadowrun5e', 'isSwarmCompanion'));
        if (isCompanion && (changes.x !== undefined || changes.y !== undefined)) {
            if (!(options as any)?.swarmSync) {
                delete changes.x;
                delete changes.y;
            }
        }

        this.#movementInProgress = true;
        let result: Awaited<ReturnType<TokenDocument['_preUpdate']>>;

        try {
            result = await super._preUpdate(...args);
        } finally {
            this.#movementInProgress = false;
        }

        return result;
    }

    public swarmSyncPromise: Promise<void> | null = null;

    override _onUpdate(...args: Parameters<TokenDocument['_onUpdate']>) {
        super._onUpdate(...args);

        const [changed, options, userId] = args;
        if (game.user?.id === userId && (changed.x !== undefined || changed.y !== undefined) && !(options as any)?.swarmSync) {
            this.swarmSyncPromise = this.syncSwarmCompanions();
        }
    }

    public async syncSwarmCompanions(): Promise<void> {
        const isLeader = Boolean(this.getFlag('shadowrun5e', 'isSwarmLeader'));
        if (!isLeader || !this.parent) return;

        const companionIds = (this.getFlag('shadowrun5e', 'swarmCompanionTokenIds') as string[] | undefined) || [];
        if (!companionIds.length) return;

        const scene = this.parent as Scene;
        const companionTokens: Array<NonNullable<ReturnType<typeof scene.tokens.get>>> = [];
        for (const id of companionIds) {
            const token = scene.tokens.get(id);
            if (token) companionTokens.push(token);
        }
        if (!companionTokens.length) return;

        const updates = companionTokens.map(companion => {
            const offset = (companion.getFlag('shadowrun5e', 'swarmRelativeOffset') as { dx: number; dy: number } | undefined) ?? { dx: 0, dy: 0 };
            return {
                _id: companion.id,
                x: Math.round(this.x + offset.dx),
                y: Math.round(this.y + offset.dy),
            };
        });

        await scene.updateEmbeddedDocuments('Token', updates, { swarmSync: true } as any);
    }

    /**
     * Handles system-specific cleanup before the token document is deleted.
     */
    protected override async _preDelete(...args: Parameters<TokenDocument["_preDelete"]>) {
        // Disconnect from any networks before a token actor is deleted (skip visual swarm companions).
        const isSwarmCompanion = Boolean(this.getFlag('shadowrun5e', 'isSwarmCompanion'));
        if (isSwarmCompanion && this.parent) {
            const scene = this.parent as Scene;
            const leaderId = this.getFlag('shadowrun5e', 'swarmLeaderTokenId') as string | undefined;
            if (leaderId) {
                const leader = scene.tokens.get(leaderId) as SR5TokenDocument | undefined;
                if (leader) {
                    const currentCompanions = (leader.getFlag('shadowrun5e', 'swarmCompanionTokenIds') as string[] | undefined) || [];
                    const updated = currentCompanions.filter(id => id !== this.id);
                    await leader.setFlag('shadowrun5e', 'swarmCompanionTokenIds', updated);
                    if (leader.actor && leader.actor.isType('vehicle') && leader.actor.system.swarm?.active) {
                        await (leader.actor as any).update({ 'system.swarm.count': Math.max(1, updated.length + 1) });
                    }
                }
            }
        }

        if (this.actor && !isSwarmCompanion) {
            if (this.actor.isType('vehicle')) {
                const driver = this.actor.getVehicleDriver();
                if (driver) {
                    try {
                        await RiggerFlow.jumpOut(driver, this.actor);
                    } catch (e) {
                        console.warn('SR5 | Failed to jump out driver on vehicle token delete', e);
                    }
                }
            }
            if (this.actor.isToken) {
                try {
                    await StorageFlow.deleteStorageReferences(this.actor);
                } catch (e) {
                    console.warn('SR5 | Failed to delete storage references for token actor', e);
                }
            }
        }

        return super._preDelete(...args);
    }

    /**
     * Measure movement path and assign a movement action ('walk' | 'run' | 'sprint') to each provided waypoint.
     *
     * Behavior:
     * - Delegates mathematical measurement to TokenDocument.measureMovementPath and then annotates the original
     *   waypoints with an action based on the actor's movement thresholds.
     * - Only adjusts waypoint.action when:
     *     - The token's actor exposes movement data,
     *     - The current movementAction is 'walk' (the user is measuring a walking move),
     *     - No movement is currently in progress (to avoid flicker while the token is actually moving).
     * - Uses measured waypoint cost from the computed measurement. If a measured cost is unavailable the waypoint
     *   is left unchanged.
     */
    override measureMovementPath(
        waypoints: TokenDocument.MeasuredMovementWaypoint[],
        options?: TokenDocument.MeasureMovementPathOptions,
    ): foundry.grid.BaseGrid.MeasurePathResult {
        const measurement = super.measureMovementPath(waypoints, options);
        const movementData = this.actor?.system.movement;

        // Abort if actor has no movement data, it's not a standard walk, or movement is in progress.
        if (!movementData || this.movementAction !== "walk" || this.#movementInProgress) {
            return measurement;
        }

        const { walk, run } = movementData;

        for (let i = 0; i < waypoints.length; i++) {
            const waypoint = waypoints[i];
            const cost = measurement.waypoints[i].cost;

            if (!Number.isFinite(cost)) continue;

            if (cost > run.value) {
                waypoint.action = "sprint";
            } else if (cost > walk.value) {
                waypoint.action = "run";
            } else {
                waypoint.action = "walk";
            }
        }

        return measurement;
    }

    /**
     * Clears running and sprinting status effects when movement history is reset.
     */
    override async clearMovementHistory() {
        await super.clearMovementHistory();

        // Phase markers are metadata for the recorded history and must never outlive it.
        if (this.getFlag(SYSTEM_NAME, FLAGS.TokenMovementPhaseMarkers)?.length) {
            await this.unsetFlag(SYSTEM_NAME, FLAGS.TokenMovementPhaseMarkers);
        }

        if (this.actor && game.settings.get(SYSTEM_NAME, FLAGS.TokenAutoRunning)) {
            // Concurrently remove running/sprinting status effects.
            await Promise.all([
                this.actor.toggleStatusEffect("sr5run", { active: false }),
                this.actor.toggleStatusEffect("sr5sprint", { active: false }),
            ]);
        }
    }

    /**
     * A hook handler that automatically applies 'running' or 'sprinting' status effects based on movement distance.
     */
    static async moveToken(
        token: TokenDocument.Implementation,
        movement: DeepReadonly<TokenDocument.MovementOperation>,
        operation: Partial<foundry.abstract.types.DatabaseUpdateOperation>,
        user: User.Implementation,
    ): Promise<void> {
        // Perform checks to ensure this logic should run.
        if (game.user.id !== user.id) return;
        if (!token.actor?.system.movement) return;
        if (!game.settings.get(SYSTEM_NAME, FLAGS.TokenAutoRunning)) return;

        const { walk, run } = token.actor.system.movement;
        const cost = token.measureMovementPath(token.movementHistory).cost;

        // Determine the required movement state.
        const shouldSprint = cost > run.value;
        const shouldRun = !shouldSprint && cost > walk.value;

        // Concurrently apply the correct status effects.
        await Promise.all([
            token.actor.toggleStatusEffect("sr5run", { active: shouldRun }),
            token.actor.toggleStatusEffect("sr5sprint", { active: shouldSprint }),
        ]);
    }

    /**
     * Mark the final recorded waypoint of this token's current action phase.
     * A marker is replaced when the same combat round and initiative pass are replayed.
     */
    async recordMovementPhaseMarker(combatId: string, round: number, pass: number): Promise<void> {
        const history = this.movementHistory;
        const waypointIndex = history.length - 1;
        const waypoint = history.at(-1);
        if (!waypoint?.movementId) return;

        const markers = this.getFlag(SYSTEM_NAME, FLAGS.TokenMovementPhaseMarkers) ?? [];
        const marker = { combatId, round, pass, waypointIndex, movementId: waypoint.movementId };

        // A phase with no new movement has the same endpoint as the last marked phase.
        if (markers.some(existing =>
            existing.combatId === combatId
            && existing.waypointIndex === marker.waypointIndex
            && existing.movementId === marker.movementId
        )) return;

        const remaining = markers.filter(existing => !(
            existing.combatId === combatId && existing.round === round && existing.pass === pass
        ));

        await this.setFlag(SYSTEM_NAME, FLAGS.TokenMovementPhaseMarkers, [...remaining, marker]);
    }
}
