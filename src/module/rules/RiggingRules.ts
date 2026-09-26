import { SR5Actor } from '@/module/actor/SR5Actor';
import { SR5Item } from '@/module/item/SR5Item';
import { AttributeRules } from '@/module/rules/AttributeRules';
import { SkillRules } from '@/module/rules/SkillRules';
import { SuccessTestData } from '@/module/tests/SuccessTest';

const { fromUuidSync } = foundry.utils;

export class RiggingRules {
    /**
     * Modify the roll data by using the Driver's data
     * @param driver - the Actor that is driving
     * @param rollData
     */
    static modifyRollDataForDriver(driver: SR5Actor, rollData: SR5Actor['system']) {
        const injectAttributes = ['intuition', 'reaction', 'logic', 'agility'];
        AttributeRules.injectAttributes(injectAttributes, driver, rollData, { bigger: false });

        const injectSkills = ['perception', 'sneaking', 'gunnery', ...this.PilotSkills];
        SkillRules.injectSkills(injectSkills, driver, rollData, { bigger: false });
    }

    static readonly PilotSkills = [
        'pilot_aerospace',
        'pilot_aircraft',
        'pilot_exotic_vehicle',
        'pilot_ground_craft',
        'pilot_walker',
        'pilot_watercraft'
    ] as const;

    /**
     * Determine if the provided testData should be considered a matrix action when a Rigger is jumped in
     * Defined in SR5 pg #266 "VR AND RIGGING"
     * @param testData
     */
    static isConsideredMatrixAction(testData: SuccessTestData): boolean {
        if (testData.categories.includes('rigging')) return true;
        if (['sensor', 'handling', 'speed'].includes(testData.action.limit.attribute)) return true;
        if (['gunnery', ...this.PilotSkills].includes(testData.action.skill)) return true;
        return false;
    }

    /**
     * Calculate maximum local autosoft slots for a drone.
     * SR5 CRB pg 269: Drones have autosoft program slots equal to ceil(Device Rating / 2) [or ceil(Pilot / 2)].
     */
    static getMaxAutosoftSlots(drone: SR5Actor): number {
        if (!drone.isType('vehicle')) return 0;
        const pilot = drone.system.vehicle_stats?.pilot?.value || 1;
        return Math.ceil(pilot / 2);
    }

    /**
     * Get running/equipped local autosofts on a drone actor.
     */
    static getRunningLocalAutosofts(drone: SR5Actor): SR5Item<'program'>[] {
        if (!drone.isType('vehicle')) return [];
        const programs = (drone.itemsForType.get('program') || []).filter(item => item.isType('program'));
        return programs.filter(item => {
            return item.system.type === 'autosoft' && item.isEquipped();
        });
    }

    /**
     * Get loaded/equipped autosofts from an RCC device.
     */
    static getLoadedRCCAutosofts(rccItem: SR5Item): SR5Item<'program'>[] {
        if (!rccItem.isType('device') || rccItem.system.category !== 'rcc') return [];

        const owner = rccItem.actorOwner;
        if (!owner) return [];

        const programs = (owner.itemsForType.get('program') || []).filter(item => item.isType('program'));
        const rccDevices = (owner.itemsForType.get('device') || []).filter(d => d.isType('device') && d.system.category === 'rcc');

        return programs.filter(item => {
            if (item.system.type !== 'autosoft' || !item.isEquipped()) return false;
            const itemMaster = item.system.technology?.master || (item.getFlag('shadowrun5e', 'rccUuid') as string | undefined);
            if (itemMaster) {
                return itemMaster === rccItem.uuid;
            }
            return rccDevices.length <= 1 || rccDevices[0].uuid === rccItem.uuid;
        });
    }

    /**
     * Calculate RCC Sharing vs Noise Reduction state and soft warnings.
     */
    static getRCCSharingInfo(rccItem: SR5Item) {
        if (!rccItem.isType('device') || rccItem.system.category !== 'rcc') {
            return {
                deviceRating: 0,
                sharing: 0,
                noiseReduction: 0,
                isOverAllocated: false,
                loadedAutosoftsCount: 0,
                isOverSharingLimit: false
            };
        }

        const deviceRating = rccItem.getRating();
        const sharing = Number(rccItem.system.sharing || 0);
        const noiseReduction = Number(rccItem.system.noise_reduction || 0);

        const loadedAutosofts = this.getLoadedRCCAutosofts(rccItem);
        const loadedAutosoftsCount = loadedAutosofts.length;

        return {
            deviceRating,
            sharing,
            noiseReduction,
            isOverAllocated: (sharing + noiseReduction) > deviceRating,
            loadedAutosoftsCount,
            isOverSharingLimit: loadedAutosoftsCount > sharing
        };
    }

    /**
     * Resolve the target skill key for an autosoft program.
     * Uses item.system.skill if explicitly set, otherwise infers from autosoftType.
     */
    static getSkillForAutosoft(item: SR5Item<'program'>, drone?: SR5Actor): string {
        if (item.system.skill) return item.system.skill;

        switch (item.system.autosoftType) {
            case 'clearsight':
                return 'perception';
            case 'stealth':
                return 'sneaking';
            case 'targeting':
                return 'gunnery';
            case 'electronic_warfare':
                return 'electronic_warfare';
            case 'maneuvering':
                return (drone?.isType('vehicle') ? drone.getVehicleTypeSkillName() : undefined) || 'pilot_ground_craft';
            case 'evasion':
                return 'gymnastics';
            default:
                return '';
        }
    }

    /**
     * Get all effective autosofts running on a drone.
     * Follows SR5 CRB p. 267: if any local autosoft is running, all RCC shared autosofts are ignored.
     */
    static getAllEffectiveAutosofts(drone: SR5Actor): SR5Item<'program'>[] {
        if (!drone.isType('vehicle')) return [];

        const localAutosofts = this.getRunningLocalAutosofts(drone);
        if (localAutosofts.length > 0) {
            return localAutosofts;
        }

        const masterItem = drone.master;
        if (masterItem && masterItem.isType('device') && masterItem.system.category === 'rcc') {
            return this.getLoadedRCCAutosofts(masterItem);
        }

        return [];
    }

    /**
     * Resolve effective autosoft rating for a drone action.
     * Hierarchy:
     * 1. If drone has ANY local running autosofts: use local matching autosoft (RCC ignored).
     * 2. Else if drone is slaved to an active RCC: use RCC loaded matching autosoft.
     * 3. Else rating = 0.
     */
    static getEffectiveAutosoft(
        drone: SR5Actor,
        autosoftType: string,
        options?: { model?: string; weapon?: string; skill?: string }
    ): { rating: number; source: 'local' | 'rcc' | 'none'; name?: string } {
        if (!drone.isType('vehicle')) return { rating: 0, source: 'none' };

        const droneModel = options?.model || drone.name || '';
        const requestedWeapon = options?.weapon || '';
        const requestedSkill = options?.skill || '';

        const matchesAutosoft = (item: SR5Item<'program'>) => {
            const itemSkill = RiggingRules.getSkillForAutosoft(item, drone);

            // If a specific skill is requested, check if item's skill matches
            if (requestedSkill) {
                if (itemSkill && itemSkill === requestedSkill) return true;
                if (item.system.autosoftType !== autosoftType) return false;
            } else {
                if (item.system.autosoftType !== autosoftType) return false;
            }

            // Targeting autosoft matches specific targetWeapon if specified
            if (autosoftType === 'targeting' && item.system.targetWeapon && requestedWeapon) {
                const tw = item.system.targetWeapon.toLowerCase();
                const rw = requestedWeapon.toLowerCase();
                if (tw !== rw && !rw.includes(tw) && !tw.includes(rw)) {
                    return false;
                }
            }

            // Maneuvering / Stealth / Evasion autosofts match specific model if specified
            if (['maneuvering', 'stealth', 'evasion'].includes(autosoftType) && item.system.targetModel && droneModel) {
                const tm = item.system.targetModel.toLowerCase();
                const dm = droneModel.toLowerCase();
                if (tm !== dm && !dm.includes(tm) && !tm.includes(dm)) {
                    return false;
                }
            }

            return true;
        };

        const localAutosofts = this.getRunningLocalAutosofts(drone);

        if (localAutosofts.length > 0) {
            const match = localAutosofts.find(matchesAutosoft);
            if (match) {
                return {
                    rating: match.getRating(),
                    source: 'local',
                    name: match.name
                };
            }
            return { rating: 0, source: 'local' };
        }

        // Check if slaved to an RCC master device
        const masterItem = drone.master;
        if (masterItem && masterItem.isType('device') && masterItem.system.category === 'rcc') {
            const rccAutosofts = this.getLoadedRCCAutosofts(masterItem);
            const match = rccAutosofts.find(matchesAutosoft);
            if (match) {
                return {
                    rating: match.getRating(),
                    source: 'rcc',
                    name: match.name
                };
            }
        }

        return { rating: 0, source: 'none' };
    }

    /**
     * Calculate comprehensive Drone Swarm stats for mixed or uniform drone swarms.
     * Rules Reference: Rigger 5.0, p. 31 (Swarm Program)
     */
    static getSwarmStats(
        leaderActor: SR5Actor,
        memberActors: SR5Actor[] = [],
        rcc?: SR5Item<'device'> | null,
    ): {
        swarmPilot: number;
        highestPilot: number;
        memberCount: number;
        bonus: number;
        highestSensor: number;
        lowestHandling: number;
        lowestSpeed: number;
        lowestAcceleration: number;
        sharedAutosofts: Array<{
            name: string;
            autosoftType: string;
            rating: number;
            targetModel?: string;
            targetWeapon?: string;
            skill?: string;
        }>;
    } {
        if (!leaderActor.isType('vehicle')) {
            return {
                swarmPilot: 0,
                highestPilot: 0,
                memberCount: 0,
                bonus: 0,
                highestSensor: 0,
                lowestHandling: 0,
                lowestSpeed: 0,
                lowestAcceleration: 0,
                sharedAutosofts: [],
            };
        }

        const validMembers = [leaderActor, ...memberActors.filter(m => m.uuid !== leaderActor.uuid && m.isType('vehicle'))];
        const count = Math.max(validMembers.length, Number(leaderActor.system.swarm?.count) || 1);
        const bonus = Math.max(0, count - 1);

        const pilots = validMembers.map(m => m.system.vehicle_stats?.pilot?.base || m.system.vehicle_stats?.pilot?.value || 1);
        const highestPilot = Math.max(...pilots, 1);

        // RCC Device Rating can act as Swarm Pilot if higher
        const rccDeviceRating = rcc?.system.technology?.rating || 0;
        const effectiveBasePilot = Math.max(highestPilot, rccDeviceRating);
        const swarmPilot = effectiveBasePilot + bonus;

        const sensors = validMembers.map(m => m.system.vehicle_stats?.sensor?.base || m.system.vehicle_stats?.sensor?.value || 0);
        const highestSensor = Math.max(...sensors, 0);

        const handlings = validMembers.map(m => m.system.vehicle_stats?.handling?.base || m.system.vehicle_stats?.handling?.value || 1);
        const lowestHandling = Math.min(...handlings);

        const speeds = validMembers.map(m => m.system.vehicle_stats?.speed?.base || m.system.vehicle_stats?.speed?.value || 1);
        const lowestSpeed = Math.min(...speeds);

        const accelerations = validMembers.map(m => m.system.vehicle_stats?.acceleration?.base || m.system.vehicle_stats?.acceleration?.value || 1);
        const lowestAcceleration = Math.min(...accelerations);

        // Pool autosofts across all swarm members and RCC
        const autosoftMap = new Map<string, {
            name: string;
            autosoftType: string;
            rating: number;
            targetModel?: string;
            targetWeapon?: string;
            skill?: string;
        }>();

        const allAutosofts: SR5Item<'program'>[] = [];
        for (const member of validMembers) {
            allAutosofts.push(...this.getRunningLocalAutosofts(member));
        }
        if (rcc) {
            allAutosofts.push(...this.getLoadedRCCAutosofts(rcc));
        }

        for (const item of allAutosofts) {
            const type = item.system.autosoftType || 'other';
            const tm = item.system.targetModel || '';
            const tw = item.system.targetWeapon || '';
            const sk = item.system.skill || '';
            const key = `${type}::${tm}::${tw}::${sk}`;
            const rating = item.getRating();
            const existing = autosoftMap.get(key);
            if (!existing || rating > existing.rating) {
                autosoftMap.set(key, {
                    name: item.name || '',
                    autosoftType: type,
                    rating,
                    targetModel: tm || undefined,
                    targetWeapon: tw || undefined,
                    skill: sk || undefined,
                });
            }
        }

        return {
            swarmPilot,
            highestPilot: effectiveBasePilot,
            memberCount: count,
            bonus,
            highestSensor,
            lowestHandling,
            lowestSpeed,
            lowestAcceleration,
            sharedAutosofts: Array.from(autosoftMap.values()),
        };
    }

    /**
     * Calculate Drone Swarm Pilot info and pool bonus.
     * Formula: Swarm Pilot = Base Pilot + (Count of Drones in Swarm - 1).
     */
    static getSwarmPilotInfo(drone: SR5Actor): { swarmPilot: number; highestPilot: number; memberCount: number; bonus: number } {
        if (!drone.isType('vehicle')) {
            return { swarmPilot: 0, highestPilot: 0, memberCount: 0, bonus: 0 };
        }

        const isSwarmActive = Boolean(drone.system.swarm.active);
        if (!isSwarmActive) {
            return { swarmPilot: 0, highestPilot: 0, memberCount: 0, bonus: 0 };
        }

        const stats = RiggingRules.getSwarmStats(drone);
        return {
            swarmPilot: stats.swarmPilot,
            highestPilot: stats.highestPilot,
            memberCount: stats.memberCount,
            bonus: stats.bonus,
        };
    }
}
