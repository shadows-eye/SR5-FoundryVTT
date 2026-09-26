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
        if (eligible.length > 0) {
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
        if (!this.selectedLeaderUuid && eligible.length > 0) {
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

        const leaderActor = eligible.find(d => d.uuid === this.selectedLeaderUuid);
        const memberActors = eligible.filter(d => this.selectedMemberUuids.has(d.uuid ?? '') && d.uuid !== this.selectedLeaderUuid);

        if (leaderActor) {
            context.swarmStats = RiggingRules.getSwarmStats(leaderActor, memberActors, this.equippedRCC);
        } else {
            context.swarmStats = null;
        }

        return context;
    }

    static #toggleMember(this: SwarmConfigManager, event: Event) {
        event.preventDefault();
        event.stopPropagation();
        const target = event.currentTarget as HTMLElement | null;
        const uuid = target?.dataset?.uuid;
        if (!uuid) return;

        if (this.selectedMemberUuids.has(uuid)) {
            // Cannot deselect leader directly without changing leader
            if (uuid === this.selectedLeaderUuid && this.selectedMemberUuids.size > 1) {
                const remaining = Array.from(this.selectedMemberUuids).filter(u => u !== uuid);
                this.selectedLeaderUuid = remaining[0];
            }
            this.selectedMemberUuids.delete(uuid);
        } else {
            this.selectedMemberUuids.add(uuid);
        }

        void this.render(false);
    }

    static #setLeader(this: SwarmConfigManager, event: Event) {
        event.stopPropagation();
        const target = event.currentTarget as HTMLElement | null;
        const uuid = target?.dataset?.uuid;
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

        // Check if leader token already exists on canvas
        let leaderToken = scene.tokens.find(t => t.actorId === leaderActor.id);
        const gridSize = canvas.grid?.size || 100;

        if (!leaderToken) {
            // Spawn leader token at canvas center
            const center = canvas.stage?.position ?? { x: 500, y: 500 };
            const leaderData = await leaderActor.getTokenDocument({ x: center.x, y: center.y });
            const created = await scene.createEmbeddedDocuments('Token', [leaderData.toObject()]);
            leaderToken = created[0];
        }

        if (!leaderToken) {
            ui.notifications?.error('Failed to resolve or create leader token on scene.');
            return;
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

        // Update leader actor count
        await (leaderActor as any).update({
            'system.swarm.active': true,
            'system.swarm.count': companionIds.length + 1
        });

        ui.notifications?.info(`Deployed swarm of ${companionIds.length + 1} drones around ${leaderActor.name}!`);
        await this.close();
    }

    static #cancel(this: SwarmConfigManager, event: Event) {
        event.preventDefault();
        void this.close();
    }
}
