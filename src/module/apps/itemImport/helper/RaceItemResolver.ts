import { Parser } from 'xml2js';
import { ImportHelper as IH } from './ImportHelper';
import { QualityParser } from '../parser/quality/QualityParser';
import { UpdateActionFlow } from '../../../item/flows/UpdateActionFlow';
import { SR5Item } from '../../../item/SR5Item';
import { BulkImporter } from '../apps/BulkImporter';
import { Quality } from '../schema/QualitiesSchema';
import { Constants } from '../importer/Constants';

const { fromUuid } = foundry.utils;

export interface RacialItemFlag {
    foundryUuid: string;
    chummerId: string;
    name: string;
    category?: string;
}

/**
 * Helper to resolve and automatically import linked race items into standard import compendiums.
 *
 * - **Triggered on World Load**: In `hooks.ts` during the `ready` hook (only for GMs),
 *   it calls `RaceItemResolver.syncRaceCompendiumLinkedItems()`.
 * - **Scans Race Compendium**: It inspects the race items in `packs/sr5e-races` and extracts
 *   the items listed in `flags.shadowrun5e.racialItems`.
 * - **Checks Target Compendium**: It checks whether each item already exists in the standard
 *   empty import compendium (`world.sr5trait`). If already present, it skips it.
 * - **Imports Missing Linked Items via Chummer**: If missing, it resolves the Chummer quality
 *   definition, runs it through `QualityParser`, assigns the exact `_id` specified in the flag,
 *   and creates the document in `world.sr5trait` with `{ keepId: true }`.
 */
export class RaceItemResolver {
    private static fullQualitiesXml: string | null = null;

    public static async syncRaceCompendiumLinkedItems(): Promise<void> {
        const racePack = game.packs.get('shadowrun5e.sr5e-races') || game.packs.get('sr5e-races');
        if (!racePack) return;

        const raceDocs = await racePack.getDocuments();
        const itemsToResolve: RacialItemFlag[] = [];

        for (const raceDoc of raceDocs) {
            const racialItems = (raceDoc.flags as any)?.shadowrun5e?.racialItems as RacialItemFlag[] | undefined;
            if (!racialItems || !Array.isArray(racialItems)) continue;

            for (const item of racialItems) {
                if (!item.foundryUuid) continue;
                itemsToResolve.push(item);
            }
        }

        if (itemsToResolve.length === 0) return;

        const uniqueItems = Array.from(new Map(itemsToResolve.map(i => [i.foundryUuid, i])).values());

        for (const item of uniqueItems) {
            await this.ensureItemImported(item);
        }
    }

    public static async ensureItemImported(item: RacialItemFlag): Promise<void> {
        const targetId = item.foundryUuid.split('.').pop();
        if (!targetId) return;

        try {
            const existing = await fromUuid(item.foundryUuid);
            if (existing) return;
        } catch {
            // ignore
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
        UpdateActionFlow.injectActionTestsIntoChangeData(parsedItem.type, parsedItem as any, parsedItem);

        (parsedItem as any)._id = targetId;
        IH.setItem('Quality', qualityData.name._TEXT, targetId);

        await SR5Item.create(parsedItem, { pack: `world.${compConfig.pack}`, keepId: true });
        console.log(`SR5 | Ingested racial trait "${item.name}" into compendium "world.${compConfig.pack}" with ID "${targetId}"`);
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

    private static async getQualityData(chummerId: string, name?: string): Promise<Quality | null> {
        try {
            if (!this.fullQualitiesXml) {
                this.fullQualitiesXml = await BulkImporter.fetchGitHubFile('Chummer/data/qualities.xml') || null;
            }

            if (this.fullQualitiesXml) {
                const searchTag = chummerId ? `<id>${chummerId}</id>` : `<name>${name}</name>`;
                const idx = this.fullQualitiesXml.indexOf(searchTag);
                if (idx !== -1) {
                    const start = this.fullQualitiesXml.lastIndexOf('<quality>', idx);
                    const end = this.fullQualitiesXml.indexOf('</quality>', idx) + 10;
                    if (start !== -1 && end > start) {
                        const snippet = this.fullQualitiesXml.substring(start, end);
                        const parsed = await this.parseXml<Quality | { quality: Quality }>(snippet);
                        return ('quality' in parsed ? (parsed as any).quality : parsed) as Quality;
                    }
                }
            }
        } catch (err) {
            console.warn(`SR5 | Failed fetching qualities.xml from GitHub:`, err);
        }

        return null;
    }
}
