import { SheetFlow } from '@/module/flows/SheetFlow';
import { SR5BaseItemSheetData, SR5ItemSheet } from '../SR5ItemSheet';
import { SR5Item } from '../SR5Item';
import { CreateMetavariantDialog } from '@/module/apps/dialogs/CreateMetavariantDialog';
import { MetavariantData, Race } from '@/module/types/item/Race';
import { SR5 } from '@/module/config';

const { fromUuid, fromUuidSync } = foundry.utils;

interface ResolvedGrantedItem {
    uuid: string;
    name: string;
    img?: string;
    type?: string;
}

interface MetavariantDisplayData extends MetavariantData {
    isActive: boolean;
    isOnlyVariant: boolean;
    attributeSummary: string;
    resolvedQualities: ResolvedGrantedItem[];
    resolvedWeapons: ResolvedGrantedItem[];
    resolvedItems: ResolvedGrantedItem[];
}

interface SR5RaceSheetData extends SR5BaseItemSheetData {
    variantOptions: { key: string; label: string; karma: number; selected: boolean }[];
    metavariantsList: MetavariantDisplayData[];
}

export class SR5RaceSheet extends SR5ItemSheet<SR5RaceSheetData> {
    declare document: SR5Item<'race'>;

    /** @override */
    static override get DEFAULT_OPTIONS() {
        return foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
            classes: ['race', 'named-sheet'],
            position: {
                width: 680,
                height: 580,
            },
            actions: {
                createMetavariant: SR5RaceSheet.#onCreateMetavariant,
                deleteMetavariant: SR5RaceSheet.#onDeleteMetavariant,
                removeGrantedUuid: SR5RaceSheet.#onRemoveGrantedUuid,
                openGrantedItem: SR5RaceSheet.#onOpenGrantedItem,
            },
        }, { inplace: false });
    }

    static override PARTS = {
        ...super.PARTS,
        header: {
            template: SheetFlow.templateBase('item/header/race'),
            scrollable: ['.scrollable'],
        },
        details: {
            template: SheetFlow.templateBase('item/tabs/details/race'),
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

    override async _prepareContext(options: Parameters<SR5ItemSheet["_prepareContext"]>[0]) {
        const context = await super._prepareContext(options) as unknown as SR5RaceSheetData;
        const system = this.document.system as Race;
        const metavariants: Record<string, MetavariantData> = system.metavariants ?? {};
        const activeVariant = system.activeVariant;
        const variantEntries = Object.values(metavariants);

        context.variantOptions = variantEntries.map(v => ({
            key: v.name,
            label: v.label || v.name,
            karma: v.karma ?? 0,
            selected: v.name === activeVariant,
        }));

        context.metavariantsList = await Promise.all(variantEntries.map(async v => {
            const attrParts: string[] = [];
            for (const [attr, range] of Object.entries(v.attributes ?? {})) {
                const attrLabel = (SR5.attributes as Record<string, string>)[attr]
                    ? game.i18n.localize((SR5.attributes as Record<string, string>)[attr])
                    : attr;
                attrParts.push(`${attrLabel}: ${range.min ?? 1}/${range.max ?? 6}`);
            }

            const resolveUuids = async (uuids: string[]): Promise<ResolvedGrantedItem[]> => {
                const results: ResolvedGrantedItem[] = [];
                for (const uuid of uuids) {
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

            return {
                ...v,
                isActive: v.name === activeVariant,
                isOnlyVariant: variantEntries.length <= 1,
                attributeSummary: attrParts.join(', '),
                resolvedQualities: await resolveUuids(v.qualities || []),
                resolvedWeapons: await resolveUuids(v.weapons || []),
                resolvedItems: await resolveUuids(v.items || []),
            };
        }));

        return context;
    }

    protected override async _onDropItem(event: DragEvent, item: SR5Item) {
        const dropTarget = (event.target as HTMLElement)?.closest<HTMLElement>('[data-drop-variant]');
        const system = this.document.system as Race;
        const targetVariantName = dropTarget?.dataset.dropVariant || system.activeVariant;
        if (!targetVariantName) return;

        const metavariants = foundry.utils.deepClone(system.metavariants || {});
        const variant = metavariants[targetVariantName];
        if (!variant) return;

        const uuid = item.uuid;
        if (!uuid) return;
        let category: 'qualities' | 'weapons' | 'items' = 'items';
        if (item.isType('quality')) category = 'qualities';
        else if (item.isType('weapon')) category = 'weapons';

        variant[category] = Array.from(new Set<string>([...(variant[category] || []), uuid]));

        await this.document.update({
            [`system.metavariants.${targetVariantName}.${category}`]: variant[category],
        } as any);
    }

    static async #onCreateMetavariant(this: SR5RaceSheet) {
        const system = this.document.system as Race;
        const baseRanges = system.getActiveAttributeRanges();
        const createdVariant = await CreateMetavariantDialog.promptCreate(baseRanges);
        if (!createdVariant) return;

        const metavariants = foundry.utils.deepClone(system.metavariants || {});
        metavariants[createdVariant.name] = createdVariant;

        await this.document.update({ 'system.metavariants': metavariants } as any);
    }

    static async #onDeleteMetavariant(this: SR5RaceSheet, event: Event) {
        const button = event.currentTarget as HTMLElement;
        const variantName = button?.dataset.variantName;
        if (!variantName) return;

        const system = this.document.system as Race;
        const metavariants = foundry.utils.deepClone(system.metavariants || {});
        if (Object.keys(metavariants).length <= 1) {
            ui.notifications?.warn('SR5 | Cannot delete the only metavariant of a race.');
            return;
        }

        delete metavariants[variantName];

        const updateData: Record<string, any> = {
            'system.metavariants': metavariants,
            [`system.metavariants.-=${variantName}`]: null,
        };

        if (system.activeVariant === variantName) {
            updateData['system.activeVariant'] = Object.keys(metavariants)[0];
        }

        await this.document.update(updateData as any);
    }

    static async #onRemoveGrantedUuid(this: SR5RaceSheet, event: Event) {
        const button = event.currentTarget as HTMLElement;
        const variantName = button?.dataset.variantName;
        const category = button?.dataset.category as 'qualities' | 'weapons' | 'items' | undefined;
        const uuid = button?.dataset.uuid;

        if (!variantName || !category || !uuid) return;

        const system = this.document.system as Race;
        const metavariants = foundry.utils.deepClone(system.metavariants || {});
        const variant = metavariants[variantName];
        if (!variant || !Array.isArray(variant[category])) return;

        variant[category] = variant[category].filter((u: string) => u !== uuid);

        await this.document.update({
            [`system.metavariants.${variantName}.${category}`]: variant[category],
        } as any);
    }

    static async #onOpenGrantedItem(this: SR5RaceSheet, event: Event) {
        const anchor = event.currentTarget as HTMLElement;
        const uuid = anchor?.dataset.uuid;
        if (!uuid) return;

        const doc = await fromUuid(uuid);
        if (doc && 'sheet' in doc && doc.sheet) {
            (doc.sheet as any).render(true);
        }
    }
}
