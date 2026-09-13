import { SR5 } from "@/module/config";
import { BaseItemData, ItemBase } from "./ItemBase";
const { StringField, ObjectField } = foundry.data.fields;

export interface MetavariantAttributeRange {
    min?: number;
    max?: number;
    aug_max?: number;
}

export interface MetavariantData {
    name: string;           // immutable English name (identifier, e.g. "Elf", "Dryad")
    label: string;          // forward-facing editable display label (e.g. "Elf", "Dryade")
    karma: number;          // karma cost for this metavariant (e.g. 40, 90)
    attributes: Record<string, MetavariantAttributeRange>;
    qualities: string[];    // UUIDs of traits / qualities
    weapons: string[];      // UUIDs of natural weapons / special weapons
    items: string[];        // UUIDs of other items
    description?: string;
}

const RaceData = () => ({
    ...BaseItemData(),

    race: new StringField({ required: true, nullable: false, initial: 'Human' }),
    label: new StringField({ required: true, nullable: false, initial: 'Human' }),
    subtype: new StringField({
        required: true,
        nullable: false,
        initial: 'metahuman',
        choices: SR5.raceSubtypes,
    }),
    activeVariant: new StringField({ required: true, nullable: false, initial: 'Human' }),
    metavariants: new ObjectField({
        required: true,
        nullable: false,
        initial: {},
    }),
});

export class Race extends ItemBase<ReturnType<typeof RaceData>> {
    declare race: string;
    declare label: string;
    declare activeVariant: string;
    declare metavariants: Record<string, MetavariantData>;

    static override defineSchema() {
        return RaceData();
    }

    static override LOCALIZATION_PREFIXES = ["SR5.Race", "SR5.Item"];

    /**
     * Get the active metavariant's data object, falling back to the first defined variant.
     */
    get activeVariantData(): MetavariantData | undefined {
        if (!this.metavariants) return undefined;
        return this.metavariants[this.activeVariant] ?? Object.values(this.metavariants)[0];
    }

    /**
     * Effective karma cost from the active metavariant.
     */
    get karma(): number {
        return this.activeVariantData?.karma ?? 0;
    }

    /**
     * Granted qualities UUIDs from the active metavariant.
     */
    get qualities(): string[] {
        return this.activeVariantData?.qualities ?? [];
    }

    /**
     * Granted natural or special weapons UUIDs from the active metavariant.
     */
    get weapons(): string[] {
        return this.activeVariantData?.weapons ?? [];
    }

    /**
     * Granted other items UUIDs from the active metavariant.
     */
    get items(): string[] {
        return this.activeVariantData?.items ?? [];
    }

    /**
     * Attribute ranges defined on the active metavariant.
     */
    getActiveAttributeRanges(): Record<string, MetavariantAttributeRange> {
        return this.activeVariantData?.attributes ?? {};
    }

    /**
     * All granted UUIDs combined and deduplicated.
     */
    getAllGrantedUuids(): { qualities: string[]; weapons: string[]; items: string[]; all: string[] } {
        const qualities = Array.from(new Set(this.qualities));
        const weapons = Array.from(new Set(this.weapons));
        const items = Array.from(new Set(this.items));
        const all = Array.from(new Set([...qualities, ...weapons, ...items]));
        return { qualities, weapons, items, all };
    }
}
