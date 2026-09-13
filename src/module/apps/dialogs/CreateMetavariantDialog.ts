import { PromptDialog, PromptDialogData } from './PromptDialog';
import { SR5_APPV2_CSS_CLASS } from '@/module/constants';
import { MetavariantAttributeRange, MetavariantData } from '@/module/types/item/Race';
import { SR5 } from '@/module/config';

export class CreateMetavariantDialog extends PromptDialog {
    constructor(baseRanges: Record<string, MetavariantAttributeRange> = {}, options = {}) {
        const dialogData = CreateMetavariantDialog.getDialogData(baseRanges);
        super(dialogData, options);
    }

    /** @override */
    static override get DEFAULT_OPTIONS() {
        return foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
            id: 'create-metavariant-application',
            classes: [SR5_APPV2_CSS_CLASS, 'sr5', 'form-dialog', 'create-metavariant-dialog'],
            window: {
                title: 'SR5.Race.CreateMetavariant',
                resizable: true,
            },
            position: {
                width: 520,
                height: 'auto' as const,
            },
        }, { inplace: false });
    }

    static getDialogData(baseRanges: Record<string, MetavariantAttributeRange> = {}): PromptDialogData {
        const testableAttrs = [
            'body', 'agility', 'reaction', 'strength',
            'willpower', 'logic', 'intuition', 'charisma', 'edge'
        ];

        const attributes = testableAttrs.map(key => {
            const label = (SR5.attributes as Record<string, string>)[key]
                ? game.i18n.localize((SR5.attributes as Record<string, string>)[key])
                : key;
            const existing = baseRanges[key] ?? {};
            return {
                key,
                label,
                min: existing.min ?? 1,
                max: existing.max ?? 6,
            };
        });

        return {
            title: game.i18n.localize('SR5.Race.CreateMetavariant'),
            buttons: {
                create: {
                    label: game.i18n.localize('SR5.Create'),
                    icon: 'fa-solid fa-plus',
                },
                cancel: {
                    label: game.i18n.localize('SR5.Cancel'),
                    icon: 'fa-solid fa-times',
                },
            },
            default: 'create',
            templateData: { attributes },
            templatePath: 'systems/shadowrun5e/dist/templates/apps/dialogs/create-metavariant-dialog.hbs',
            onAfterClose: async (html, selectedButton) => {
                if (selectedButton === 'cancel') return null;

                const name = (html.find('input[name="name"]').val() as string || '').trim();
                if (!name) return null;

                const label = (html.find('input[name="label"]').val() as string || '').trim() || name;
                const karma = parseInt(html.find('input[name="karma"]').val() as string, 10) || 0;
                const description = (html.find('textarea[name="description"]').val() as string || '').trim();

                const attrRanges: Record<string, MetavariantAttributeRange> = {};
                for (const key of testableAttrs) {
                    const minVal = parseInt(html.find(`input[name="attr_${key}_min"]`).val() as string, 10);
                    const maxVal = parseInt(html.find(`input[name="attr_${key}_max"]`).val() as string, 10);

                    const range: MetavariantAttributeRange = {};
                    if (!isNaN(minVal)) range.min = minVal;
                    if (!isNaN(maxVal)) {
                        range.max = maxVal;
                        range.aug_max = Math.floor(maxVal * 1.5);
                    }
                    if (range.min !== undefined || range.max !== undefined) {
                        attrRanges[key] = range;
                    }
                }

                const newVariant: MetavariantData = {
                    name,
                    label,
                    karma,
                    attributes: attrRanges,
                    qualities: [],
                    weapons: [],
                    items: [],
                    description,
                };

                return newVariant;
            },
        };
    }

    /**
     * Prompt user to configure and create a new metavariant.
     */
    static async promptCreate(baseRanges?: Record<string, MetavariantAttributeRange>): Promise<MetavariantData | null> {
        const dialog = new CreateMetavariantDialog(baseRanges);
        const result = await (dialog as any).prompt();
        return (result && typeof result === 'object' && 'name' in result) ? result as MetavariantData : null;
    }
}
