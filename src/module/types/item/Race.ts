import { SR5 } from "@/module/config";
import { BaseItemData, ItemBase } from "./ItemBase";
const { ArrayField, DocumentUUIDField, NumberField, ObjectField, StringField } = foundry.data.fields;

export interface AttributeRange {
    min?: number;
    max?: number;
    aug_max?: number;
}

const RaceData = () => ({
    ...BaseItemData(),

    // Parent baseline race category: human, elf, dwarf, ork, troll, or custom module-expanded
    race: new StringField({
        required: true,
        nullable: false,
        initial: 'human',
        choices: () => (CONFIG as any)?.SR5?.races || SR5.races,
    }),
    // Subtype category (metahuman, metasapient, shapeshifter, infected, critter, spirit, etc.)
    subtype: new StringField({
        required: true,
        nullable: false,
        initial: 'metahuman',
        choices: SR5.raceSubtypes,
    }),
    // Karma cost for this metavariant / race
    karma: new NumberField({
        required: true,
        nullable: false,
        integer: true,
        initial: 0,
        min: 0,
    }),
    // Attribute min / max / aug_max ranges for this race (body, agility, etc.)
    attributes: new ObjectField({
        required: true,
        nullable: false,
        initial: {},
    }),
    // Granted quality UUIDs
    qualities: new ArrayField(new DocumentUUIDField({ required: true })),
    // Granted natural or special weapon UUIDs
    weapons: new ArrayField(new DocumentUUIDField({ required: true })),
    // Granted other item UUIDs
    items: new ArrayField(new DocumentUUIDField({ required: true })),
});

export class Race extends ItemBase<ReturnType<typeof RaceData>> {
    declare race: string;
    declare subtype: keyof typeof SR5.raceSubtypes;
    declare karma: number;
    declare attributes: Record<string, AttributeRange>;
    declare qualities: string[];
    declare weapons: string[];
    declare items: string[];

    static override defineSchema() {
        return RaceData();
    }

    static override LOCALIZATION_PREFIXES = ["SR5.Race", "SR5.Item"];

    /**
     * All attribute ranges defined on this race item.
     */
    getActiveAttributeRanges(): Record<string, AttributeRange> {
        return this.attributes ?? {};
    }

    /**
     * All granted UUIDs combined and deduplicated.
     */
    getAllGrantedUuids(): { qualities: string[]; weapons: string[]; items: string[]; all: string[] } {
        const qualities = Array.from(new Set(this.qualities ?? []));
        const weapons = Array.from(new Set(this.weapons ?? []));
        const items = Array.from(new Set(this.items ?? []));
        const all = Array.from(new Set([...qualities, ...weapons, ...items]));
        return { qualities, weapons, items, all };
    }
}
