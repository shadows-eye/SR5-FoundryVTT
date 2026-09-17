import { SR5Actor } from '../actor/SR5Actor';
import { SR5Item } from '../item/SR5Item';
import { MetatypeItemResolver, MetatypeItemFlag } from '../apps/itemImport/helper/MetatypeItemResolver';
import { Constants } from '../apps/itemImport/importer/Constants';

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

        // 4. Synchronize actor metatype, metatypeUuid, and add new metatype attribute values
        const updateData: Record<string, unknown> = {
            'system.metatype': newMetatypeItem.name,
            'system.metatypeUuid': sourceUuid || newMetatypeItem.uuid,
        };

        const ranges = newMetatypeItem.system.getActiveAttributeRanges();
        for (const [attr, range] of Object.entries(ranges)) {
            if (range.min != null && attr in actor.system.attributes) {
                const attrKey = attr as keyof typeof actor.system.attributes;
                const attribute = actor.system.attributes[attrKey];
                if (attribute && typeof attribute === 'object' && 'base' in attribute) {
                    const currentBase = attribute.base ?? 0;
                    updateData[`system.attributes.${attr}.base`] = currentBase + range.min;
                }
            }
        }

        await actor.update(updateData);

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
                let doc: SR5Item | null = null;
                const found = await fromUuid(uuid);
                if (found instanceof SR5Item) {
                    doc = found;
                }

                // If direct UUID resolution fails, fallback to direct compendium pack loading
                if (!doc && uuid.startsWith('Compendium.')) {
                    const parts = uuid.slice(11).split('.');
                    const packId = `${parts[0]}.${parts[1]}`;
                    const targetId = parts[parts.length - 1];
                    const pack = game.packs.get(packId);
                    if (pack && targetId) {
                        const packDoc = await pack.getDocument(targetId);
                        if (packDoc instanceof SR5Item) {
                            doc = packDoc;
                        }
                    }
                }

                // If still not found, check metadata flags or compendium search
                if (!doc) {
                    const flags = metatypeItem.flags?.shadowrun5e?.metaTypesItems;
                    const metaFlag = Array.isArray(flags)
                        ? flags.find(f => f.foundryUuid === uuid || f.chummerId === uuid)
                        : undefined;

                    if (metaFlag) {
                        await MetatypeItemResolver.ensureItemImported(metaFlag as MetatypeItemFlag);
                        if (metaFlag.foundryUuid) {
                            const imported = await fromUuid(metaFlag.foundryUuid);
                            if (imported instanceof SR5Item) {
                                doc = imported;
                            }
                        }

                        if (!doc && metaFlag.name) {
                            const compKey = (category === 'weapon' ? 'Weapon' : category === 'item' ? 'Gear' : 'Quality');
                            const compConfig = Constants.MAP_COMPENDIUM_KEY[compKey];
                            const pack = game.packs.get(`world.${compConfig.pack}`);
                            if (pack) {
                                await pack.getIndex();
                                const entry = pack.index.find(e => e.name?.toLowerCase() === metaFlag.name.toLowerCase());
                                if (entry?._id) {
                                    const entryDoc = await pack.getDocument(entry._id);
                                    if (entryDoc instanceof SR5Item) {
                                        doc = entryDoc;
                                    }
                                }
                            }
                        }
                    }
                }

                if (doc instanceof SR5Item) {
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
            const isFlagMatch = item.flags?.shadowrun5e?.grantedByMetatype === metatypeItem.id;

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
    static async onMetatypeUpdated(actor: SR5Actor, metatypeItem: SR5Item<'metatype'>, changed: Record<string, unknown>) {
        if (!actor.isType('character')) return;
        if (typeof changed.name === 'string' && changed.name !== actor.system.metatype) {
            await actor.update({ system: { metatype: changed.name } });
        }
    }

    /**
     * Handle deletion of a metatype item: cleans up its granted items and clears actor metatype link.
     */
    static async onMetatypeDeleted(actor: SR5Actor, metatypeItem: SR5Item<'metatype'>) {
        if (!actor.isType('character')) return;

        await this.cleanupMetatypeGrantedItems(actor, metatypeItem);

        const updateData: Record<string, unknown> = {};

        const currentUuid = actor.system.metatypeUuid;
        if (currentUuid === metatypeItem.uuid || actor.system.metatype === metatypeItem.name) {
            updateData['system.metatypeUuid'] = null;
            updateData['system.metatype'] = '';
        }

        const ranges = metatypeItem.system.getActiveAttributeRanges();
        for (const [attr, range] of Object.entries(ranges)) {
            if (range.min != null && attr in actor.system.attributes) {
                const attrKey = attr as keyof typeof actor.system.attributes;
                const attribute = actor.system.attributes[attrKey];
                if (attribute && typeof attribute === 'object' && 'base' in attribute) {
                    const currentBase = attribute.base ?? 0;
                    updateData[`system.attributes.${attr}.base`] = Math.max(0, currentBase - range.min);
                }
            }
        }

        if (Object.keys(updateData).length > 0) {
            await actor.update(updateData);
        }
    }
}
