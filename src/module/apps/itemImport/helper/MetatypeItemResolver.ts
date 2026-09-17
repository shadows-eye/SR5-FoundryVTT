import { Parser } from 'xml2js';
import { ImportHelper as IH } from './ImportHelper';
import { QualityParser } from '../parser/quality/QualityParser';
import { UpdateActionFlow } from '../../../item/flows/UpdateActionFlow';
import { SR5Item } from '../../../item/SR5Item';
import { BulkImporter } from '../apps/BulkImporter';
import { QualitiesSchema, Quality } from '../schema/QualitiesSchema';
import { Constants } from '../importer/Constants';

const { fromUuid } = foundry.utils;

export interface MetatypeItemFlag {
    foundryUuid?: string;
    chummerId?: string;
    name: string;
    category?: string;
    id?: string;
    type?: string;
}

/**
 * Helper to resolve and automatically import linked metatype items into standard import compendiums.
 *
 * - **Triggered on World Load & Bulk Import**: In `hooks.ts` during the `ready` hook (only for GMs),
 *   and in `BulkImporter.ts` after parsing importers, it calls `MetatypeItemResolver.syncMetatypeCompendiumLinkedItems()`.
 * - **Scans Metatype Compendium**: It inspects the metatype items in `packs/sr5e-metatypes` and extracts
 *   the items listed in `flags.shadowrun5e.metaTypesItems` (e.g. Low-Light Vision, Thermographic Vision,
 *   Resistance to Pathogens/Toxins, Dermal Deposits).
 * - **Checks Target Compendium**: It checks whether each item already exists in the standard
 *   empty import compendium (`world.sr5trait`). If already present, it skips it.
 * - **Imports Missing Linked Items via Chummer**: If missing, it resolves the Chummer quality
 *   definition, runs it through `QualityParser`, assigns the exact `_id` specified in the flag,
 *   and creates the document in `world.sr5trait` with `{ keepId: true }`.
 */
export class MetatypeItemResolver {
    private static fullQualitiesXml: string | null = null;
    private static parsedQualitiesMap: Map<string, Quality> | null = null;

    public static async syncMetatypeCompendiumLinkedItems(): Promise<void> {
        const metatypePack = game.packs.get('shadowrun5e.sr5e-metatypes')
            || game.packs.get('sr5e-metatypes');
        if (!metatypePack) return;

        const metatypeDocs = await metatypePack.getDocuments();
        const itemsToResolve: MetatypeItemFlag[] = [];

        for (const doc of metatypeDocs) {
            if (!(doc instanceof SR5Item)) continue;
            const items = doc.flags?.shadowrun5e?.metaTypesItems;
            if (!items || !Array.isArray(items)) continue;

            for (const item of items) {
                if (!item.foundryUuid) continue;
                itemsToResolve.push(item as MetatypeItemFlag);
            }
        }

        if (itemsToResolve.length === 0) return;

        const uniqueItems = Array.from(new Map(itemsToResolve.map(i => [i.foundryUuid, i])).values());

        for (const item of uniqueItems) {
            await this.ensureItemImported(item);
        }
    }

    public static async ensureItemImported(item: MetatypeItemFlag): Promise<void> {
        const targetId = item.foundryUuid ? item.foundryUuid.split('.').pop() : item.id;
        if (!targetId) return;

        if (item.foundryUuid) {
            try {
                const existing = await fromUuid(item.foundryUuid);
                if (existing) return;
            } catch {
                // ignore
            }
        }

        const compKey = (item.category === 'weapon' ? 'Weapon' : item.category === 'item' ? 'Gear' : 'Quality');
        const compConfig = Constants.MAP_COMPENDIUM_KEY[compKey];
        const compendium = await IH.GetCompendium(compKey);
        if (compendium.index.has(targetId)) return;

        const qualityData = await this.getQualityData(item.chummerId, item.name);
        if (!qualityData) {
            console.warn(`SR5 | Could not find Chummer data for racial item "${item.name}" (${item.chummerId})`);
            return;
        }

        const parser = new QualityParser();
        const parsedItem = await parser.Parse(qualityData, 'Quality') as Item.CreateData;
        const createData = {
            ...parsedItem,
            _id: targetId,
        };
        IH.setItem('Quality', qualityData.name._TEXT, targetId);

        await SR5Item.create(createData, { pack: `world.${compConfig.pack}`, keepId: true });
        await compendium.getIndex();
        console.log(`SR5 | Ingested metatype trait "${item.name}" into compendium "world.${compConfig.pack}" with ID "${targetId}"`);
    }

    private static async parseXml<T>(xmlString: string): Promise<T> {
        const parser = new Parser({
            trim: true,
            attrkey: "$",
            charkey: "_TEXT",
            emptyTag: () => null,
            explicitRoot: false,
            explicitArray: false,
            explicitCharkey: true,
        });
        return parser.parseStringPromise(xmlString);
    }

    private static async getQualityData(chummerId?: string, name?: string): Promise<Quality | null> {
        try {
            if (!this.parsedQualitiesMap) {
                if (!this.fullQualitiesXml) {
                    this.fullQualitiesXml = await BulkImporter.fetchGitHubFile('Chummer/data/qualities.xml') || null;
                }

                if (this.fullQualitiesXml) {
                    const parsed = await this.parseXml<QualitiesSchema>(this.fullQualitiesXml);
                    const rawQualities = parsed?.qualities?.quality;
                    const list: Quality[] = Array.isArray(rawQualities) ? rawQualities : (rawQualities ? [rawQualities] : []);
                    this.parsedQualitiesMap = new Map();
                    for (const q of list) {
                        if (q.id?._TEXT) {
                            this.parsedQualitiesMap.set(q.id._TEXT, q);
                        }
                        if (q.name?._TEXT) {
                            this.parsedQualitiesMap.set(q.name._TEXT.toLowerCase(), q);
                        }
                    }
                }
            }

            if (this.parsedQualitiesMap) {
                if (chummerId && this.parsedQualitiesMap.has(chummerId)) {
                    return this.parsedQualitiesMap.get(chummerId)!;
                }
                if (name && this.parsedQualitiesMap.has(name.toLowerCase())) {
                    return this.parsedQualitiesMap.get(name.toLowerCase())!;
                }
            }
        } catch (err) {
            console.warn(`SR5 | Failed fetching or parsing qualities.xml from GitHub:`, err);
        }

        return null;
    }
}
