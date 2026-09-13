import { SR5Actor } from '../actor/SR5Actor';
import { SR5Item } from '../item/SR5Item';
import { MetavariantSelectionDialog } from '../apps/dialogs/MetavariantSelectionDialog';
import { RacePresets } from '../data/RacePresets';
import { MetavariantData } from '../types/item/Race';

const { fromUuid } = foundry.utils;

export class RaceFlow {
    /**
     * Prompt user to select a metavariant and apply the race item to the character actor.
     */
    static async promptAndApplyRaceItem(actor: SR5Actor, raceItem: SR5Item<'race'> | Record<string, any>) {
        if (!actor.isType('character')) return null;

        const metavariants = raceItem.system?.metavariants ?? {};
        const variantKeys = Object.keys(metavariants);

        // If only 1 variant or no dialog desired, we could apply directly, but dialog gives clear confirmation
        const selectedVariantName = await MetavariantSelectionDialog.promptSelection(raceItem);
        if (!selectedVariantName) return null;

        return this.applyRaceToActor(actor, raceItem, selectedVariantName);
    }

    /**
     * Apply the race item to the actor with the chosen metavariant.
     * Cleans up prior race items and their linked items, embeds the new race item,
     * resolves granted UUIDs, and updates actor metatype.
     */
    static async applyRaceToActor(
        actor: SR5Actor,
        raceItemSource: SR5Item<'race'> | Record<string, any>,
        variantName?: string
    ) {
        if (!actor.isType('character')) return null;

        const sourceData = (typeof (raceItemSource as any).toObject === 'function')
            ? (raceItemSource as SR5Item<'race'>).toObject()
            : foundry.utils.deepClone(raceItemSource);

        const metavariants: Record<string, MetavariantData> = sourceData.system?.metavariants ?? {};
        const activeVariant = variantName || sourceData.system?.activeVariant || Object.keys(metavariants)[0] || 'Human';
        const variantData: MetavariantData | undefined = metavariants[activeVariant];

        // 1. Clean up existing race items and their granted items
        const existingRaces = actor.items.filter(i => i.isType('race')) as SR5Item<'race'>[];
        for (const existingRace of existingRaces) {
            await this.cleanupRaceGrantedItems(actor, existingRace);
            await existingRace.delete();
        }

        // 2. Prepare and create new race item
        sourceData.system.activeVariant = activeVariant;
        delete sourceData._id;

        const [newRaceItem] = await actor.createEmbeddedDocuments('Item', [sourceData as Item.CreateData]) as SR5Item<'race'>[];

        // 3. Resolve and create granted items from UUIDs
        if (variantData) {
            await this.grantVariantItems(actor, variantData);
        }

        // 4. Synchronize actor metatype
        const metatypeLabel = variantData?.label || variantData?.name || sourceData.name;
        await actor.update({ 'system.metatype': metatypeLabel } as any);

        return newRaceItem;
    }

    /**
     * Resolve and create embedded items on the actor from a metavariant's linked UUIDs.
     */
    static async grantVariantItems(actor: SR5Actor, variantData: MetavariantData) {
        const uuids = [
            ...(variantData.qualities || []),
            ...(variantData.weapons || []),
            ...(variantData.items || []),
        ];

        const grantedItemsToCreate: Record<string, any>[] = [];

        for (const uuid of uuids) {
            if (!uuid) continue;
            try {
                const doc = await fromUuid(uuid);
                if (doc && typeof (doc as any).toObject === 'function') {
                    const itemData = (doc as any).toObject();
                    delete itemData._id;
                    itemData._stats = {
                        ...(itemData._stats || {}),
                        compendiumSource: uuid,
                    };
                    itemData.flags = {
                        ...(itemData.flags || {}),
                        core: {
                            ...(itemData.flags?.core || {}),
                            sourceId: uuid,
                        },
                    };
                    grantedItemsToCreate.push(itemData);
                }
            } catch (err) {
                console.warn(`SR5 | Could not resolve granted item UUID: ${uuid}`, err);
            }
        }

        if (grantedItemsToCreate.length > 0) {
            await actor.createEmbeddedDocuments('Item', grantedItemsToCreate as Item.CreateData[]);
        }
    }

    /**
     * Clean up items on the actor matching any linked UUIDs from this race item.
     */
    static async cleanupRaceGrantedItems(actor: SR5Actor, raceItem: SR5Item<'race'>) {
        const allUuids = new Set<string>();
        const metavariants: Record<string, MetavariantData> = raceItem.system?.metavariants ?? {};

        for (const variant of Object.values(metavariants)) {
            for (const u of variant.qualities || []) allUuids.add(u);
            for (const u of variant.weapons || []) allUuids.add(u);
            for (const u of variant.items || []) allUuids.add(u);
        }

        if (allUuids.size === 0) return;

        const idsToDelete: string[] = [];
        for (const item of actor.items) {
            if (item.id === raceItem.id) continue;
            const sourceId = (item as any)._stats?.compendiumSource || (item.flags as any)?.core?.sourceId;
            if (sourceId && allUuids.has(sourceId)) {
                idsToDelete.push(item.id);
            }
        }

        if (idsToDelete.length > 0) {
            await actor.deleteEmbeddedDocuments('Item', idsToDelete);
        }
    }

    /**
     * Handle deletion of a race item: cleans up its granted items and restores base Human if none remain.
     */
    static async onRaceDeleted(actor: SR5Actor, raceItem: SR5Item<'race'>) {
        if (!actor.isType('character')) return;

        await this.cleanupRaceGrantedItems(actor, raceItem);

        // Fallback: If no race item remains on this character, automatically add default base Human
        const remainingRaces = actor.items.filter(i => i.isType('race') && i.id !== raceItem.id);
        if (remainingRaces.length === 0) {
            const defaultHuman = RacePresets.createDefaultHumanRaceItemData();
            await actor.createEmbeddedDocuments('Item', [defaultHuman as Item.CreateData]);
            await actor.update({ 'system.metatype': 'Human' } as any);
        }
    }

    /**
     * Handle updating activeVariant on an existing race item.
     */
    static async onRaceUpdated(actor: SR5Actor, raceItem: SR5Item<'race'>, changed: any) {
        if (!actor.isType('character')) return;
        const newVariantKey = foundry.utils.getProperty(changed, 'system.activeVariant') as string | undefined;
        if (!newVariantKey) return;

        // Clean up items from old variant
        await this.cleanupRaceGrantedItems(actor, raceItem);

        // Grant items from new variant
        const variantData = raceItem.system.metavariants?.[newVariantKey];
        if (variantData) {
            await this.grantVariantItems(actor, variantData);
            const metatypeLabel = variantData.label || variantData.name || raceItem.name;
            await actor.update({ 'system.metatype': metatypeLabel } as any);
        }
    }
}
