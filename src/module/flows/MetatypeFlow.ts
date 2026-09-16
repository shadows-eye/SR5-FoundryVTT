import { SR5Actor } from '../actor/SR5Actor';
import { SR5Item } from '../item/SR5Item';

const { fromUuid } = foundry.utils;

export class MetatypeFlow {
    /**
     * Apply the metatype item to the actor.
     * Cleans up prior metatype items and their linked items, embeds the new metatype item,
     * resolves granted UUIDs, adds granted items to the actor, updates the embedded metatype item
     * with local links, and updates actor metatype.
     */
    static async applyMetatypeToActor(
        actor: SR5Actor,
        metatypeItemSource: SR5Item<'metatype'> | Item.CreateData<'metatype'>
    ): Promise<SR5Item<'metatype'> | null> {
        if (!actor.isType('character')) return null;

        const isDoc = metatypeItemSource instanceof foundry.abstract.Document;
        const sourceData = (isDoc
            ? (metatypeItemSource as SR5Item<'metatype'>).toObject()
            : foundry.utils.deepClone(metatypeItemSource)) as Item.CreateData<'metatype'>;

        const sourceUuid = isDoc
            ? (metatypeItemSource as SR5Item<'metatype'>).uuid
            : (typeof sourceData._id === 'string' ? sourceData._id : '');

        // 1. Clean up existing metatype items and their granted items
        const existingMetatypes = actor.items.filter(i => i.isType('metatype'));
        for (const existing of existingMetatypes) {
            await this.cleanupMetatypeGrantedItems(actor, existing);
            await existing.delete();
        }

        // 2. Prepare and create new embedded metatype item
        delete sourceData._id;

        const [newMetatypeItem] = await actor.createEmbeddedDocuments('Item', [sourceData]);
        if (!newMetatypeItem || !newMetatypeItem.isType('metatype')) return null;

        // 3. Resolve and create granted items from UUIDs
        await this.grantAndLinkMetatypeItems(actor, newMetatypeItem);

        // 4. Synchronize actor metatype and metatypeUuid
        await actor.update({
            system: {
                metatype: newMetatypeItem.name,
                metatypeUuid: sourceUuid || newMetatypeItem.uuid,
            }
        });

        return newMetatypeItem;
    }

    /**
     * Resolve granted items from the metatype item's UUIDs, create them on the actor,
     * and update the actor's embedded metatype item with the local actor item UUIDs.
     */
    static async grantAndLinkMetatypeItems(actor: SR5Actor, metatypeItem: SR5Item<'metatype'>) {
        const qualitiesToResolve = metatypeItem.system.qualities || [];
        const weaponsToResolve = metatypeItem.system.weapons || [];
        const itemsToResolve = metatypeItem.system.items || [];

        const resolveItemData = async (uuid: string, category: 'quality' | 'weapon' | 'item') => {
            if (!uuid) return null;
            try {
                const doc = await fromUuid(uuid);
                if (doc instanceof foundry.abstract.Document) {
                    const data = doc.toObject() as Item.CreateData;
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
                            grantedByMetatype: metatypeItem.id ?? undefined,
                            grantedByRace: metatypeItem.id ?? undefined,
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

        // Update the links in the actor's metatype item to point to the local items on the actor
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

        await metatypeItem.update({
            system: {
                qualities: localQualities,
                weapons: localWeapons,
                items: localItems,
            }
        });
    }

    /**
     * Clean up items on the actor matching any linked UUIDs or granted flags from this metatype item.
     */
    static async cleanupMetatypeGrantedItems(actor: SR5Actor, metatypeItem: SR5Item<'metatype'>) {
        const allTrackedUuids = new Set<string>([
            ...(metatypeItem.system.qualities || []),
            ...(metatypeItem.system.weapons || []),
            ...(metatypeItem.system.items || []),
        ]);

        const idsToDelete: string[] = [];
        for (const item of actor.items) {
            if (item.id === metatypeItem.id) continue;

            const isDirectUuidMatch = allTrackedUuids.has(item.uuid);
            const sourceId = item._stats?.compendiumSource || item.flags?.core?.sourceId;
            const isSourceMatch = !!sourceId && allTrackedUuids.has(sourceId);
            const isFlagMatch = item.flags?.shadowrun5e?.grantedByMetatype === metatypeItem.id
                || item.flags?.shadowrun5e?.grantedByRace === metatypeItem.id;

            if (isDirectUuidMatch || isSourceMatch || isFlagMatch) {
                idsToDelete.push(item.id);
            }
        }

        if (idsToDelete.length > 0) {
            await actor.deleteEmbeddedDocuments('Item', idsToDelete);
        }
    }

    /**
     * Handle updates to a metatype item: synchronizes metatype name if name changed.
     */
    static async onMetatypeUpdated(actor: SR5Actor, metatypeItem: SR5Item<'metatype'>, changed: Record<string, any>) {
        if (!actor.isType('character')) return;
        if (changed.name && changed.name !== actor.system.metatype) {
            await actor.update({ system: { metatype: changed.name } });
        }
    }

    /**
     * Handle deletion of a metatype item: cleans up its granted items and clears actor metatype link.
     */
    static async onMetatypeDeleted(actor: SR5Actor, metatypeItem: SR5Item<'metatype'>) {
        if (!actor.isType('character')) return;

        await this.cleanupMetatypeGrantedItems(actor, metatypeItem);

        const currentUuid = actor.system.metatypeUuid || actor.system.raceUuid;
        if (currentUuid === metatypeItem.uuid || actor.system.metatype === metatypeItem.name) {
            await actor.update({
                system: {
                    metatypeUuid: null,
                    raceUuid: null,
                    metatype: '',
                }
            });
        }
    }

    // Backwards-compatible aliases
    static applyRaceToActor = MetatypeFlow.applyMetatypeToActor;
    static grantAndLinkRaceItems = MetatypeFlow.grantAndLinkMetatypeItems;
    static cleanupRaceGrantedItems = MetatypeFlow.cleanupMetatypeGrantedItems;
    static onRaceUpdated = MetatypeFlow.onMetatypeUpdated;
    static onRaceDeleted = MetatypeFlow.onMetatypeDeleted;
}

export const RaceFlow = MetatypeFlow;
