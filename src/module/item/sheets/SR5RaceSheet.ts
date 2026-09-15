import { SheetFlow } from '@/module/flows/SheetFlow';
import { SR5ApplicationMixin, SR5ApplicationMixinTypes } from '@/module/handlebars/SR5ApplicationMixin';
import { SR5Item } from '../SR5Item';
import { AttributeRange, Race } from '@/module/types/item/Race';
import { SR5 } from '@/module/config';
import { Helpers } from '@/module/helpers';
import ItemSheet = foundry.applications.sheets.ItemSheet;

const { fromUuid, fromUuidSync } = foundry.utils;

export interface ResolvedGrantedItem {
    uuid: string;
    name: string;
    img?: string;
    type?: string;
}

export interface SR5RaceSheetData extends ItemSheet.RenderContext, SR5ApplicationMixinTypes.RenderContext {
    item: SR5Item<'race'>;
    races: Record<string, string>;
    localizedRaces: Record<string, string>;
    attributesList: { key: string; label: string; min: number; max: number; aug_max: number }[];
    resolvedQualities: ResolvedGrantedItem[];
    resolvedWeapons: ResolvedGrantedItem[];
    resolvedItems: ResolvedGrantedItem[];
    descriptionHTML?: string;
}

export class SR5RaceSheet extends SR5ApplicationMixin(ItemSheet)<SR5RaceSheetData> {
    declare document: SR5Item<'race'>;

    static override DEFAULT_OPTIONS = {
        classes: ['item', 'race', 'race-sheet', 'named-sheet'],
        position: {
            width: 650,
            height: 560,
        },
        actions: {
            removeGrantedUuid: SR5RaceSheet.#onRemoveGrantedUuid,
            openGrantedItem: SR5RaceSheet.#onOpenGrantedItem,
        },
        dragDrop: [{ dropSelector: '.drop-zone, .tab' }],
    };

    static override PARTS = {
        header: {
            template: SheetFlow.templateBase('item/header/race'),
            scrollable: ['.scrollable'],
        },
        tabs: {
            template: SheetFlow.templateBase('common/primary-tab-group'),
            scrollable: ['.scrollable'],
        },
        details: {
            template: SheetFlow.templateBase('item/tabs/details/race'),
            scrollable: ['.scrollable'],
        },
        description: {
            template: SheetFlow.templateBase('item/tabs/description'),
            scrollable: ['.scrollable'],
        },
    };

    static override TABS = {
        primary: {
            initial: 'details',
            tabs: [
                { id: 'details', label: 'SR5.Tabs.Item.Details', cssClass: '' },
                { id: 'description', label: 'SR5.Tabs.Item.Description', cssClass: '' },
            ]
        }
    };

    override async _prepareContext(options: Parameters<ItemSheet['_prepareContext']>[0]) {
        const context = await super._prepareContext(options) as SR5RaceSheetData;
        context.item = this.document;

        const system = this.document.system as Race;

        if (this.item.system.description) {
            context.descriptionHTML = await this.enrichEditorFieldToHTML(this.item.system.description.value);
        }

        const rawRaces = (CONFIG as any)?.SR5?.races || SR5.races;
        const sortedRaces = Helpers.sortConfigValuesByTranslation(rawRaces);
        context.races = sortedRaces;
        context.localizedRaces = Object.fromEntries(
            Object.entries(sortedRaces).map(([k, v]) => [k, game.i18n.localize(v as string)])
        );

        // Prepare attribute rows for all standard physical and mental attributes
        const standardAttrs = ['body', 'agility', 'reaction', 'strength', 'willpower', 'logic', 'intuition', 'charisma', 'edge'];
        const currentRanges: Record<string, AttributeRange> = system.attributes || {};

        context.attributesList = standardAttrs.map(attr => {
            const range = currentRanges[attr] || {};
            return {
                key: attr,
                label: (SR5.attributes as Record<string, string>)[attr] ? game.i18n.localize((SR5.attributes as Record<string, string>)[attr]) : attr,
                min: range.min ?? 1,
                max: range.max ?? 6,
                aug_max: range.aug_max ?? (range.max != null ? Math.floor(range.max * 1.5) : 9),
            };
        });

        const resolveUuids = async (uuids: string[]): Promise<ResolvedGrantedItem[]> => {
            const results: ResolvedGrantedItem[] = [];
            for (const uuid of uuids || []) {
                if (!uuid) continue;
                let doc: any = fromUuidSync(uuid);
                if (!doc) {
                    try {
                        doc = await fromUuid(uuid);
                    } catch {
                        // ignore resolution errors in preparation
                    }
                }
                results.push({
                    uuid,
                    name: doc?.name || uuid,
                    img: doc?.img || 'icons/svg/item-bag.svg',
                    type: doc?.type,
                });
            }
            return results;
        };

        context.resolvedQualities = await resolveUuids(system.qualities || []);
        context.resolvedWeapons = await resolveUuids(system.weapons || []);
        context.resolvedItems = await resolveUuids(system.items || []);

        return context;
    }

    protected override async _onDrop(event: DragEvent) {
        const data = foundry.applications.ux.TextEditor.getDragEventData(event) as any;
        if (!data || data.type !== 'Item') return;
        const item = await Item.implementation.fromDropData(data) as SR5Item | null;
        if (item) await this._onDropItem(event, item);
    }

    protected async _onDropItem(event: DragEvent, item: SR5Item) {
        const uuid = item.uuid;
        if (!uuid) return;

        const dropTarget = (event.target as HTMLElement)?.closest<HTMLElement>('[data-drop-category]');
        let category: 'qualities' | 'weapons' | 'items' = (dropTarget?.dataset.dropCategory as any) || 'items';

        if (!dropTarget) {
            if (item.isType('quality')) category = 'qualities';
            else if (item.isType('weapon')) category = 'weapons';
            else category = 'items';
        }

        const system = this.document.system as Race;
        const currentList = Array.from(new Set([...(system[category] || []), uuid]));

        await this.document.update({
            [`system.${category}`]: currentList,
        } as any);
    }

    static async #onRemoveGrantedUuid(this: SR5RaceSheet, event: Event) {
        event.preventDefault();
        const button = event.currentTarget as HTMLElement;
        const category = button?.dataset.category as 'qualities' | 'weapons' | 'items' | undefined;
        const uuid = button?.dataset.uuid;

        if (!category || !uuid) return;

        const system = this.document.system as Race;
        const currentList = (system[category] || []).filter((u: string) => u !== uuid);

        await this.document.update({
            [`system.${category}`]: currentList,
        } as any);
    }

    static async #onOpenGrantedItem(this: SR5RaceSheet, event: Event) {
        event.preventDefault();
        const anchor = event.currentTarget as HTMLElement;
        const uuid = anchor?.dataset.uuid;
        if (!uuid) return;

        const doc = await fromUuid(uuid);
        if (doc && 'sheet' in doc && doc.sheet) {
            (doc.sheet as any).render(true);
        }
    }
}
