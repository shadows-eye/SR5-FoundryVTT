import { SR5Actor } from '../actor/SR5Actor';
import { SR5Item } from '../item/SR5Item';

const { fromUuid } = foundry.utils;

export class RaceFlow {
    /**
     * Apply the race item to the actor.
     * Cleans up prior race items and their linked items, embeds the new race item,
     * resolves granted UUIDs, adds granted items to the actor, updates the embedded race item
     * with local links, and updates actor metatype.
     */
    static async applyRaceToActor(
        actor: SR5Actor,
        raceItemSource: SR5Item<'race'> | Record<string, any>
    ): Promise<SR5Item<'race'> | null> {
        if (!actor.isType('character')) return null;

        const sourceData = (typeof (raceItemSource as any).toObject === 'function')
            ? (raceItemSource as SR5Item<'race'>).toObject()
            : foundry.utils.deepClone(raceItemSource);

        const sourceUuid = (raceItemSource as any).uuid || sourceData._id || '';

        // 1. Clean up existing race items and their granted items
        const existingRaces = actor.items.filter(i => i.isType('race')) as SR5Item<'race'>[];
        for (const existingRace of existingRaces) {
            await this.cleanupRaceGrantedItems(actor, existingRace);
            await existingRace.delete();
        }

        // 2. Prepare and create new embedded race item
        delete sourceData._id;

        const [newRaceItem] = await actor.createEmbeddedDocuments('Item', [sourceData as Item.CreateData]) as SR5Item<'race'>[];
        if (!newRaceItem) return null;

        // 3. Resolve and create granted items from UUIDs
        await this.grantAndLinkRaceItems(actor, newRaceItem);

        // 4. Synchronize actor metatype and raceUuid
        await actor.update({
            'system.metatype': newRaceItem.name,
            'system.raceUuid': sourceUuid || newRaceItem.uuid,
        } as any);

        return newRaceItem;
    }

    /**
     * Resolve granted items from the race item's UUIDs, create them on the actor,
     * and update the actor's embedded race item with the local actor item UUIDs.
     */
    static async grantAndLinkRaceItems(actor: SR5Actor, raceItem: SR5Item<'race'>) {
        const qualitiesToResolve = raceItem.system.qualities || [];
        const weaponsToResolve = raceItem.system.weapons || [];
        const itemsToResolve = raceItem.system.items || [];

        const resolveItemData = async (uuid: string, category: 'quality' | 'weapon' | 'item') => {
            if (!uuid) return null;
            try {
                const doc = await fromUuid(uuid);
                if (doc && typeof (doc as any).toObject === 'function') {
                    const data = (doc as any).toObject();
                    delete data._id;
                    data._stats = {
                        ...(data._stats || {}),
                        compendiumSource: uuid,
                    };
                    data.flags = {
                        ...(data.flags || {}),
                        core: {
                            ...(data.flags?.core || {}),
                            sourceId: uuid,
                        },
                        shadowrun5e: {
                            ...(data.flags?.shadowrun5e || {}),
                            grantedByRace: raceItem.id,
                            grantedCategory: category,
                        },
                    };
                    return { data, category, sourceUuid: uuid };
                }
            } catch (err) {
                console.warn(`SR5 | Could not resolve granted item UUID: ${uuid}`, err);
            }
            return null;
        };

        const resolved = [
            ...(await Promise.all(qualitiesToResolve.map(u => resolveItemData(u, 'quality')))),
            ...(await Promise.all(weaponsToResolve.map(u => resolveItemData(u, 'weapon')))),
            ...(await Promise.all(itemsToResolve.map(u => resolveItemData(u, 'item')))),
        ].filter(Boolean) as { data: Item.CreateData; category: string; sourceUuid: string }[];

        if (resolved.length === 0) return;

        const createdItems = await actor.createEmbeddedDocuments(
            'Item',
            resolved.map(r => r.data)
        ) as SR5Item[];

        // Update the links in the actor's race item to point to the local items on the actor
        const localQualities: string[] = [];
        const localWeapons: string[] = [];
        const localItems: string[] = [];

        for (let i = 0; i < createdItems.length; i++) {
            const createdItem = createdItems[i];
            const meta = resolved[i];
            const uuid = createdItem.uuid;
            if (!uuid) continue;
            if (meta.category === 'quality') localQualities.push(uuid);
            else if (meta.category === 'weapon') localWeapons.push(uuid);
            else localItems.push(uuid);
        }

        await raceItem.update({
            'system.qualities': localQualities,
            'system.weapons': localWeapons,
            'system.items': localItems,
        } as any);
    }

    /**
     * Clean up items on the actor matching any linked UUIDs or grantedByRace flags from this race item.
     */
    static async cleanupRaceGrantedItems(actor: SR5Actor, raceItem: SR5Item<'race'>) {
        const allTrackedUuids = new Set<string>([
            ...(raceItem.system.qualities || []),
            ...(raceItem.system.weapons || []),
            ...(raceItem.system.items || []),
        ]);

        const idsToDelete: string[] = [];
        for (const item of actor.items) {
            if (item.id === raceItem.id) continue;

            const isDirectUuidMatch = allTrackedUuids.has(item.uuid);
            const sourceId = (item as any)._stats?.compendiumSource || (item.flags as any)?.core?.sourceId;
            const isSourceMatch = sourceId && allTrackedUuids.has(sourceId);
            const isFlagMatch = (item.flags as any)?.shadowrun5e?.grantedByRace === raceItem.id;

            if (isDirectUuidMatch || isSourceMatch || isFlagMatch) {
                idsToDelete.push(item.id);
            }
        }

        if (idsToDelete.length > 0) {
            await actor.deleteEmbeddedDocuments('Item', idsToDelete);
        }
    }

    /**
     * Handle updates to a race item: synchronizes metatype name if name changed.
     */
    static async onRaceUpdated(actor: SR5Actor, raceItem: SR5Item<'race'>, changed: Record<string, any>) {
        if (!actor.isType('character')) return;
        if (changed.name && changed.name !== actor.system.metatype) {
            await actor.update({ 'system.metatype': changed.name } as any);
        }
    }

    /**
     * Handle deletion of a race item: cleans up its granted items and clears actor race link.
     */
    static async onRaceDeleted(actor: SR5Actor, raceItem: SR5Item<'race'>) {
        if (!actor.isType('character')) return;

        await this.cleanupRaceGrantedItems(actor, raceItem);

        // Reset raceUuid and metatype if this was the active race item
        if (actor.system.raceUuid === raceItem.uuid || actor.system.metatype === raceItem.name) {
            await actor.update({
                'system.raceUuid': null,
                'system.metatype': '',
            } as any);
        }
    }
}
