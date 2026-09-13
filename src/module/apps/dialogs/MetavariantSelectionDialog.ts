import { PromptDialog, PromptDialogData } from './PromptDialog';
import { SR5_APPV2_CSS_CLASS } from '@/module/constants';
import { SR5Item } from '@/module/item/SR5Item';
import { MetavariantData } from '@/module/types/item/Race';
import { SR5 } from '@/module/config';

export class MetavariantSelectionDialog extends PromptDialog {
    constructor(raceItem: SR5Item<'race'> | Record<string, any>, options = {}) {
        const dialogData = MetavariantSelectionDialog.getDialogData(raceItem);
        super(dialogData, options);
    }

    /** @override */
    static override get DEFAULT_OPTIONS() {
        return foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
            id: 'metavariant-selection-application',
            classes: [SR5_APPV2_CSS_CLASS, 'sr5', 'form-dialog', 'metavariant-selection-dialog'],
            window: {
                title: 'SR5.Race.SelectMetavariant',
                resizable: true,
            },
            position: {
                width: 480,
                height: 'auto' as const,
            },
        }, { inplace: false });
    }

    static getDialogData(raceItem: SR5Item<'race'> | Record<string, any>): PromptDialogData {
        const metavariants: Record<string, MetavariantData> = raceItem.system?.metavariants ?? {};
        const activeVariant = raceItem.system?.activeVariant;

        const variants = Object.values(metavariants).map((v, idx) => {
            const attrParts: string[] = [];
            for (const [attr, range] of Object.entries(v.attributes ?? {})) {
                const attrLabel = (SR5.attributes as Record<string, string>)[attr]
                    ? game.i18n.localize((SR5.attributes as Record<string, string>)[attr])
                    : attr;
                attrParts.push(`${attrLabel}: ${range.min ?? 1}/${range.max ?? 6}`);
            }

            return {
                name: v.name,
                label: v.label || v.name,
                karma: v.karma ?? 0,
                description: v.description,
                attributeSummary: attrParts.join(', '),
                active: activeVariant ? v.name === activeVariant : idx === 0,
            };
        });

        const raceLabel = raceItem.system?.label || raceItem.name || 'Race';

        return {
            title: `${game.i18n.localize('SR5.Race.SelectMetavariant')}: ${raceLabel}`,
            buttons: {
                select: {
                    label: game.i18n.localize('SR5.Race.Select'),
                    icon: 'fa-solid fa-check',
                },
                cancel: {
                    label: game.i18n.localize('SR5.Cancel'),
                    icon: 'fa-solid fa-times',
                },
            },
            default: 'select',
            templateData: { variants, raceLabel },
            templatePath: 'systems/shadowrun5e/dist/templates/apps/dialogs/metavariant-selection-dialog.hbs',
            onAfterClose: async (html, selectedButton) => {
                if (selectedButton === 'cancel') return null;
                const checkedVal = html.find('input[name="selectedVariant"]:checked').val();
                return typeof checkedVal === 'string' ? checkedVal : null;
            },
        };
    }

    /**
     * Prompt user to choose a metavariant.
     * @returns The selected metavariant name, or null if cancelled.
     */
    static async promptSelection(raceItem: SR5Item<'race'> | Record<string, any>): Promise<string | null> {
        const dialog = new MetavariantSelectionDialog(raceItem);
        const result = await (dialog as any).prompt();
        return typeof result === 'string' ? result : null;
    }
}
