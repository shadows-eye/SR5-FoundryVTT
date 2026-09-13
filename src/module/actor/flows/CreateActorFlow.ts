import { PackItemFlow } from '@/module/item/flows/PackItemFlow';
import { SR5Actor } from '../SR5Actor';
import { SkillSetFlow } from './SkillSetFlow';
import { RacePresets } from '@/module/data/RacePresets';

/**
 * SR5 specific options understood while an actor document is created.
 *
 * They're passed as part of the create operation and reach the document through
 * its _preCreate options:
 * `SR5Actor.create(data, { skipDefaultSkills: true })`
 */
export interface SR5ActorCreateOptions {
    /** Skip applying the default skill set configured for the created actor type. */
    skipDefaultSkills?: boolean;
    /** Skip applying the default race item configured for character actors. */
    skipDefaultRace?: boolean;
}

/**
 * Handles actor initialization concerns that only apply during document creation.
 *
 * This flow is intentionally narrow: it prepares newly created actors with any
 * default embedded data that should exist but can't be part of DataModel schema initials.
 */
export const CreateActorFlow = {
    /**
     * Applies the first matching default skill set for the actor type being created.
     *
     * This runs during actor creation so the initial actor state already contains
     * the configured baseline skills instead of relying on a later migration or
     * manual setup step.
     *
     * @param actor Actor to add skill items to.
     * @param data Creation data containing the actor type used for skill set selection.
     */
    async addDefaultActorSkillset(actor: SR5Actor, data: Actor.CreateData) {
        const skillSet = await this.getDefaultSkillSet(data.type);
        if (!skillSet) return;

        await SkillSetFlow.applySkillSetToActor(actor, skillSet, { useSource: true });

        console.debug(`Shadowrun 5e | Added skill set ${skillSet.name} to actor source data`);
    },

    /**
     * Applies the default base Human race item when creating a character actor.
     *
     * @param actor Actor being created
     * @param data Initial creation data
     * @param options Additional creation options
     */
    addDefaultActorRace(actor: SR5Actor, data: Actor.CreateData, options?: SR5ActorCreateOptions) {
        if (data.type !== 'character') return;
        if (options?.skipDefaultRace) return;

        // Abort if race item was already provided
        const existingItems = Array.from(actor.items).map(item => item.toObject() as Item.CreateData);
        const hasRace = existingItems.some(i => i.type === 'race') || (data.items && (data.items as any[]).some((i: any) => i.type === 'race'));
        if (hasRace) return;

        const defaultHuman = RacePresets.createDefaultHumanRaceItemData();
        actor.updateSource({
            items: [...existingItems, defaultHuman as Item.CreateData],
            'system.metatype': 'Human'
        } as any);

        console.debug('Shadowrun 5e | Added default Human race to actor source data');
    },

    /** Get the default skill set for an actor type. */
    async getDefaultSkillSet(actorType?: string) {
        const skillSets = await PackItemFlow.getAllPackSkillSets();
        const skillSet = skillSets.find(skillSet => {
            if (!skillSet.system.set.default.type) return false;
            return skillSet.system.set.default.type === actorType;
        });

        if (!skillSet) {
            console.debug(`Shadowrun 5e | No default skill set found for actor type ${actorType}, skipping default skill set application`);
            return;
        }

        return skillSet;
    }
};
