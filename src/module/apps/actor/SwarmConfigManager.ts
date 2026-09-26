import { DeepPartial } from 'fvtt-types/utils';
import { SR5Actor } from '@/module/actor/SR5Actor';
import { SheetFlow } from '@/module/flows/SheetFlow';
import { SR5_APPV2_CSS_CLASS } from '@/module/constants';
import { SR5ApplicationMixin, SR5ApplicationMixinTypes } from '@/module/handlebars/SR5ApplicationMixin';
import { RiggingRules } from '@/module/rules/RiggingRules';
import { SR5Item } from '@/module/item/SR5Item';

const { ApplicationV2 } = foundry.applications.api;
const { fromUuidSync } = foundry.utils;

export interface DroneDisplayInfo {
    uuid: string;
    name: string;
    img: string;
    pilot: number;
    sensor: number;
    speed: number;
    isSelected: boolean;
    isLeader: boolean;
}

export interface SwarmConfigManagerData extends SR5ApplicationMixinTypes.RenderContext {
    availableDrones: DroneDisplayInfo[];
    selectedLeaderUuid: string;
    selectedCount: number;
    canDeploy: boolean;
    hasActiveSwarm: boolean;
    swarmStats: {
        swarmPilot: number;
        highestPilot: number;
        memberCount: number;
        bonus: number;
        highestSensor: number;
        lowestHandling: number;
        lowestSpeed: number;
        lowestAcceleration: number;
    } | null;
}

export class SwarmConfigManager extends SR5ApplicationMixin(ApplicationV2)<SwarmConfigManagerData> {
    declare document: SR5Actor;

    static override PARTS = {
        details: {
            template: SheetFlow.templateBase('actor/apps/swarm-config-manager/details')
        },
        footer: {
            template: SheetFlow.templateBase('actor/apps/swarm-config-manager/footer')
        },
    };

    static override DEFAULT_OPTIONS = {
        classes: [SR5_APPV2_CSS_CLASS, 'swarm-config-manager'],
        form: {
            submitOnChange: false,
            closeOnSubmit: false,
        },
        position: {
            width: 560,
            height: 'auto' as const,
        },
        window: {
            resizable: true,
        },
        actions: {
            toggleMember: SwarmConfigManager.#toggleMember,
            setLeader: SwarmConfigManager.#setLeader,
            saveSwarm: SwarmConfigManager.#saveSwarm,
            deploySwarm: SwarmConfigManager.#deploySwarm,
            deleteSwarm: SwarmConfigManager.#deleteSwarm,
            cancel: SwarmConfigManager.#cancel,
        }
    };

    private selectedLeaderUuid: string = '';
    private selectedMemberUuids: Set<string> = new Set();
    private equippedRCC: SR5Item<'device'> | null = null;

    constructor(private readonly actor: SR5Actor, options = {}) {
        super(options);
        this.document = actor;

        // Discover equipped RCC if this is a character actor
        if (actor.isType('character')) {
            const rcc = actor.items.find(i => i.isType('device') && i.system.category === 'rcc' && i.isEquipped()) as SR5Item<'device'> | undefined;
            this.equippedRCC = rcc ?? null;
        }

        // Initialize from existing swarm configuration if available
        const eligible = this._getEligibleDrones();
        const activeLeader = eligible.find(d => d.system.swarm?.active);
        if (activeLeader) {
            this.selectedLeaderUuid = activeLeader.uuid ?? '';
            this.selectedMemberUuids.add(this.selectedLeaderUuid);
            for (const d of eligible) {
                if (d.system.swarm?.active && d.uuid) {
                    this.selectedMemberUuids.add(d.uuid);
                }
            }
        } else if (actor.isType('vehicle')) {
            this.selectedLeaderUuid = actor.uuid ?? '';
            this.selectedMemberUuids.add(this.selectedLeaderUuid);
        } else if (eligible.length > 0) {
            this.selectedLeaderUuid = eligible[0].uuid ?? '';
            this.selectedMemberUuids.add(this.selectedLeaderUuid);
        }
    }

    override get title() {
        return game.i18n.localize('SR5.Swarm.Title');
    }

    private _getEligibleDrones(): SR5Actor[] {
        // Collect drone/vehicle actors in world owned by player
        const allActors = (game.actors as unknown as SR5Actor[]).filter(a => a.isType('vehicle') && a.isOwner);
        return allActors;
    }

    override async _prepareContext(options: DeepPartial<SR5ApplicationMixinTypes.RenderOptions> & { isFirstRender: boolean }): Promise<SwarmConfigManagerData> {
        const context = (await super._prepareContext(options)) as SwarmConfigManagerData;
        const eligible = this._getEligibleDrones();

        // Ensure leader is selected if empty
        if (!this.selectedLeaderUuid && this.selectedMemberUuids.size > 0) {
            this.selectedLeaderUuid = Array.from(this.selectedMemberUuids)[0];
        } else if (!this.selectedLeaderUuid && eligible.length > 0) {
            this.selectedLeaderUuid = eligible[0].uuid ?? '';
            this.selectedMemberUuids.add(this.selectedLeaderUuid);
        }

        context.availableDrones = eligible.map(drone => ({
            uuid: drone.uuid ?? '',
            name: drone.name || '',
            img: drone.img || '',
            pilot: drone.system.vehicle_stats?.pilot?.base || drone.system.vehicle_stats?.pilot?.value || 1,
            sensor: drone.system.vehicle_stats?.sensor?.base || drone.system.vehicle_stats?.sensor?.value || 0,
            speed: drone.system.vehicle_stats?.speed?.base || drone.system.vehicle_stats?.speed?.value || 1,
            isSelected: this.selectedMemberUuids.has(drone.uuid ?? ''),
            isLeader: (drone.uuid ?? '') === this.selectedLeaderUuid,
        }));

        context.selectedLeaderUuid = this.selectedLeaderUuid;
        context.selectedCount = this.selectedMemberUuids.size;
        context.canDeploy = Boolean(canvas.ready && canvas.scene && this.selectedMemberUuids.size >= 2);
        context.hasActiveSwarm = Boolean(
            eligible.some(d => Boolean(d.system.swarm?.active)) ||
            (canvas.ready && canvas.scene?.tokens.some(t => Boolean(t.getFlag('shadowrun5e', 'isSwarmLeader') || t.getFlag('shadowrun5e', 'isSwarmCompanion'))))
        );

        const leaderActor = eligible.find(d => d.uuid === this.selectedLeaderUuid);
        const memberActors = eligible.filter(d => this.selectedMemberUuids.has(d.uuid ?? '') && d.uuid !== this.selectedLeaderUuid);

        if (leaderActor) {
            context.swarmStats = RiggingRules.getSwarmStats(leaderActor, memberActors, this.equippedRCC);
        } else {
            context.swarmStats = null;
        }

        return context;
    }

    static #getUuid(event: Event, target?: HTMLElement): string | undefined {
        const actionTarget = target ?? (event.target instanceof HTMLElement ? event.target : null);
        return actionTarget?.closest<HTMLElement>('[data-uuid]')?.dataset.uuid;
    }

    static #toggleMember(this: SwarmConfigManager, event: Event, target?: HTMLElement) {
        event.stopPropagation();
        const uuid = SwarmConfigManager.#getUuid(event, target);
        if (!uuid) return;

        if (this.selectedMemberUuids.has(uuid)) {
            // Cannot deselect leader directly without changing leader
            if (uuid === this.selectedLeaderUuid && this.selectedMemberUuids.size > 1) {
                const remaining = Array.from(this.selectedMemberUuids).filter(u => u !== uuid);
                this.selectedLeaderUuid = remaining[0];
            } else if (uuid === this.selectedLeaderUuid) {
                this.selectedLeaderUuid = '';
            }
            this.selectedMemberUuids.delete(uuid);
        } else {
            this.selectedMemberUuids.add(uuid);
            if (!this.selectedLeaderUuid) {
                this.selectedLeaderUuid = uuid;
            }
        }

        void this.render(false);
    }

    static #setLeader(this: SwarmConfigManager, event: Event, target?: HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        const uuid = SwarmConfigManager.#getUuid(event, target);
        if (!uuid) return;

        this.selectedLeaderUuid = uuid;
        this.selectedMemberUuids.add(uuid);
        void this.render(false);
    }

    static async #saveSwarm(this: SwarmConfigManager, event: Event) {
        event.preventDefault();
        event.stopPropagation();

        if (this.selectedMemberUuids.size < 2) {
            ui.notifications?.warn('A drone swarm requires at least 2 member drones (Rigger 5.0, p. 31).');
            return;
        }

        const leaderActor = fromUuidSync(this.selectedLeaderUuid) as SR5Actor | null;
        if (!leaderActor) return;

        const count = this.selectedMemberUuids.size;

        // Update leader actor with active swarm
        await (leaderActor as any).update({
            'system.swarm.active': true,
            'system.swarm.count': count,
        });

        // Update all member actors
        for (const uuid of this.selectedMemberUuids) {
            if (uuid === this.selectedLeaderUuid) continue;
            const member = fromUuidSync(uuid) as SR5Actor | null;
            if (member && member.isType('vehicle')) {
                await (member as any).update({
                    'system.swarm.active': true,
                    'system.swarm.count': count,
                });
            }
        }

        ui.notifications?.info(`Swarm configured with ${leaderActor.name} as leader and ${count} member drones.`);
        await this.close();
    }

    static async #deleteSwarm(this: SwarmConfigManager, event: Event) {
        event.preventDefault();
        event.stopPropagation();

        const eligible = this._getEligibleDrones();
        const activeSwarmDrones = eligible.filter(d => Boolean(d.system.swarm?.active));

        // 1. Clean up tokens on canvas if scene is ready
        if (canvas.ready && canvas.scene) {
            const scene = canvas.scene;
            const companionTokenIdsToDelete: string[] = [];

            for (const token of scene.tokens) {
                if (token.getFlag('shadowrun5e', 'isSwarmCompanion')) {
                    companionTokenIdsToDelete.push(token.id);
                } else if (token.getFlag('shadowrun5e', 'isSwarmLeader')) {
                    const compIds = (token.getFlag('shadowrun5e', 'swarmCompanionTokenIds') as string[] | undefined) || [];
                    companionTokenIdsToDelete.push(...compIds);
                    await token.unsetFlag('shadowrun5e', 'isSwarmLeader');
                    await token.unsetFlag('shadowrun5e', 'swarmCompanionTokenIds');
                }
            }

            const uniqueIdsToDelete = Array.from(new Set(companionTokenIdsToDelete)).filter(id => scene.tokens.has(id));
            if (uniqueIdsToDelete.length > 0) {
                await scene.deleteEmbeddedDocuments('Token', uniqueIdsToDelete);
            }
        }

        // 2. Reset swarm status on actors
        const actorsToReset = new Set<SR5Actor>();
        for (const drone of activeSwarmDrones) {
            actorsToReset.add(drone);
        }
        for (const uuid of this.selectedMemberUuids) {
            const actor = fromUuidSync(uuid) as SR5Actor | null;
            if (actor && actor.isType('vehicle')) {
                actorsToReset.add(actor);
            }
        }

        for (const actor of actorsToReset) {
            await (actor as any).update({
                'system.swarm.active': false,
                'system.swarm.count': 1,
            });
        }

        this.selectedMemberUuids.clear();
        this.selectedLeaderUuid = '';

        ui.notifications?.info(game.i18n.localize('SR5.Swarm.SwarmDeleted'));
        await this.close();
    }

    static async #deploySwarm(this: SwarmConfigManager, event: Event) {
        event.preventDefault();
        event.stopPropagation();

        if (!canvas.ready || !canvas.scene) {
            ui.notifications?.warn('Canvas is not ready to deploy tokens.');
            return;
        }

        if (this.selectedMemberUuids.size < 2) {
            ui.notifications?.warn('A drone swarm requires at least 2 member drones (Rigger 5.0, p. 31).');
            return;
        }

        const scene = canvas.scene;
        const leaderActor = fromUuidSync(this.selectedLeaderUuid) as SR5Actor | null;
        if (!leaderActor) return;

        const gridSize = canvas.grid?.size || 100;

        // Locate player's token on the active scene to spawn swarm adjacent to player
        let playerToken: { x: number; y: number; width?: number } | undefined = scene.tokens.find(t => t.actorId === this.actor.id);
        if (!playerToken && this.actor.isType('vehicle')) {
            const driver = this.actor.getVehicleDriver();
            if (driver) {
                playerToken = scene.tokens.find(t => t.actorId === driver.id);
            }
        }
        if (!playerToken && canvas.tokens?.controlled?.length) {
            const controlled = canvas.tokens.controlled[0];
            if (controlled) {
                playerToken = { x: controlled.x, y: controlled.y, width: controlled.document.width };
            }
        }
        const userCharId = game.user?.character?.id;
        if (!playerToken && userCharId) {
            playerToken = scene.tokens.find(t => t.actorId === userCharId);
        }

        // Calculate spawn position next to the player token (to the right, or fallback to center)
        const spawnX = playerToken ? playerToken.x + ((playerToken.width || 1) * gridSize) : 500;
        const spawnY = playerToken ? playerToken.y : 500;

        // Check if leader token already exists on canvas
        let leaderToken = scene.tokens.find(t => t.actorId === leaderActor.id);

        if (!leaderToken) {
            // Spawn leader token next to player token
            const leaderData = await leaderActor.getTokenDocument({
                x: spawnX,
                y: spawnY,
            });
            const created = await scene.createEmbeddedDocuments('Token', [leaderData.toObject()]);
            leaderToken = created[0];
        }

        if (!leaderToken) {
            ui.notifications?.error('Failed to resolve or create leader token on scene.');
            return;
        }

        // Remove any previous companion tokens for this leader token to prevent duplicates
        const oldCompanionIds = (leaderToken.getFlag('shadowrun5e', 'swarmCompanionTokenIds') as string[] | undefined) || [];
        const validOldIds = oldCompanionIds.filter(id => scene.tokens.has(id));
        if (validOldIds.length > 0) {
            await scene.deleteEmbeddedDocuments('Token', validOldIds);
        }

        const companions = Array.from(this.selectedMemberUuids).filter(u => u !== this.selectedLeaderUuid);
        const radius = gridSize * 0.7;
        const companionTokenDatas: any[] = [];

        for (let i = 0; i < companions.length; i++) {
            const memberActor = fromUuidSync(companions[i]) as SR5Actor | null;
            if (!memberActor) continue;

            const angle = -Math.PI / 2 + (2 * Math.PI * i) / companions.length;
            const dx = Math.round(Math.cos(angle) * radius);
            const dy = Math.round(Math.sin(angle) * radius);

            const tokenDoc = await memberActor.getTokenDocument({
                x: leaderToken.x + dx,
                y: leaderToken.y + dy,
                texture: { scaleX: 0.75, scaleY: 0.75 },
                flags: {
                    shadowrun5e: {
                        isSwarmCompanion: true,
                        swarmLeaderTokenId: leaderToken.id,
                        swarmRelativeOffset: { dx, dy }
                    }
                }
            });

            companionTokenDatas.push(tokenDoc.toObject());
        }

        const createdCompanions = await scene.createEmbeddedDocuments('Token', companionTokenDatas);
        const companionIds = createdCompanions.map(c => c.id).filter(Boolean);

        // Update leader token with flags
        await leaderToken.setFlag('shadowrun5e', 'isSwarmLeader', true);
        await leaderToken.setFlag('shadowrun5e', 'swarmCompanionTokenIds', companionIds);

        // Update leader actor count & active
        await (leaderActor as any).update({
            'system.swarm.active': true,
            'system.swarm.count': companionIds.length + 1
        });

        // Also update all member actors
        for (const uuid of companions) {
            const member = fromUuidSync(uuid) as SR5Actor | null;
            if (member && member.isType('vehicle')) {
                await (member as any).update({
                    'system.swarm.active': true,
                    'system.swarm.count': companionIds.length + 1
                });
            }
        }

        ui.notifications?.info(`Deployed swarm of ${companionIds.length + 1} drones around ${leaderActor.name}!`);
        await this.close();
    }

    static #cancel(this: SwarmConfigManager, event: Event) {
        event.preventDefault();
        void this.close();
    }
}
