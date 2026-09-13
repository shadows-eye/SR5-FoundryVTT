import { MetavariantData } from '../types/item/Race';

export interface RacePresetDefinition {
    name: string;
    label: string;
    subtype: string;
    description: string;
    baseMetavariant: MetavariantData;
}

export const RACE_PRESETS: Record<string, RacePresetDefinition> = {
    human: {
        name: 'Human',
        label: 'SR5.Character.Types.Human',
        subtype: 'metahuman',
        description: '<p>Humans are the baseline metatype in the Sixth World.</p>',
        baseMetavariant: {
            name: 'Human',
            label: 'SR5.Character.Types.Human',
            karma: 0,
            attributes: {
                edge: { min: 2, max: 7, aug_max: 10 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Baseline Human metatype.',
        },
    },
    elf: {
        name: 'Elf',
        label: 'SR5.Character.Types.Elf',
        subtype: 'metahuman',
        description: '<p>Elves are taller and more slender than humans, known for their agility and charisma.</p>',
        baseMetavariant: {
            name: 'Elf',
            label: 'SR5.Character.Types.Elf',
            karma: 40,
            attributes: {
                agility: { min: 2, max: 7, aug_max: 10 },
                charisma: { min: 3, max: 8, aug_max: 12 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Standard Elf metatype with natural low-light vision and graceful physique.',
        },
    },
    dwarf: {
        name: 'Dwarf',
        label: 'SR5.Character.Types.Dwarf',
        subtype: 'metahuman',
        description: '<p>Dwarves are shorter and stockier than humans, renowned for their endurance and strength.</p>',
        baseMetavariant: {
            name: 'Dwarf',
            label: 'SR5.Character.Types.Dwarf',
            karma: 50,
            attributes: {
                body: { min: 3, max: 8, aug_max: 12 },
                reaction: { min: 1, max: 5, aug_max: 7 },
                strength: { min: 3, max: 8, aug_max: 12 },
                willpower: { min: 2, max: 7, aug_max: 10 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Standard Dwarf metatype with thermographic vision and increased pathogen resistance.',
        },
    },
    ork: {
        name: 'Ork',
        label: 'SR5.Character.Types.Ork',
        subtype: 'metahuman',
        description: '<p>Orks possess heavy builds, prominent tusks, and exceptional physical fortitude.</p>',
        baseMetavariant: {
            name: 'Ork',
            label: 'SR5.Character.Types.Ork',
            karma: 50,
            attributes: {
                body: { min: 4, max: 9, aug_max: 13 },
                strength: { min: 3, max: 8, aug_max: 12 },
                logic: { min: 1, max: 5, aug_max: 7 },
                charisma: { min: 1, max: 5, aug_max: 7 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Standard Ork metatype with low-light vision and rugged durability.',
        },
    },
    troll: {
        name: 'Troll',
        label: 'SR5.Character.Types.Troll',
        subtype: 'metahuman',
        description: '<p>Trolls are the largest metahumans, with horns, dermal deposits, and massive reach.</p>',
        baseMetavariant: {
            name: 'Troll',
            label: 'SR5.Character.Types.Troll',
            karma: 90,
            attributes: {
                body: { min: 5, max: 10, aug_max: 15 },
                agility: { min: 1, max: 5, aug_max: 7 },
                strength: { min: 5, max: 10, aug_max: 15 },
                logic: { min: 1, max: 5, aug_max: 7 },
                intuition: { min: 1, max: 5, aug_max: 7 },
                charisma: { min: 1, max: 4, aug_max: 6 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Standard Troll metatype with thermographic vision, dermal deposits, and reach.',
        },
    },
};

/** Common metavariants for quick pre-filling or reference */
export const COMMON_METAVARIANTS: Record<string, MetavariantData[]> = {
    elf: [
        {
            name: 'Dryad',
            label: 'Dryad',
            karma: 90,
            attributes: {
                body: { min: 1, max: 6, aug_max: 9 },
                agility: { min: 2, max: 7, aug_max: 10 },
                reaction: { min: 1, max: 6, aug_max: 9 },
                strength: { min: 1, max: 5, aug_max: 7 },
                willpower: { min: 1, max: 6, aug_max: 9 },
                logic: { min: 1, max: 6, aug_max: 9 },
                intuition: { min: 1, max: 6, aug_max: 9 },
                charisma: { min: 3, max: 8, aug_max: 12 },
                edge: { min: 1, max: 6, aug_max: 9 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Dryad metavariant with Glamour, Symbiosis, and Low-Light Vision.',
        },
        {
            name: 'Nocturna',
            label: 'Nocturna',
            karma: 60,
            attributes: {
                body: { min: 1, max: 5, aug_max: 7 },
                agility: { min: 3, max: 8, aug_max: 12 },
                charisma: { min: 2, max: 7, aug_max: 10 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Nocturna metavariant with Keen Hearing, Nocturnal, and Low-Light Vision.',
        },
        {
            name: 'Wakyambi',
            label: 'Wakyambi',
            karma: 70,
            attributes: {
                agility: { min: 2, max: 7, aug_max: 10 },
                intuition: { min: 2, max: 7, aug_max: 10 },
                logic: { min: 1, max: 5, aug_max: 7 },
                charisma: { min: 1, max: 6, aug_max: 9 },
                edge: { min: 2, max: 7, aug_max: 10 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Wakyambi metavariant with Elongated Limbs, Celerity, and Low-Light Vision.',
        },
        {
            name: 'Xapiri Thëpë',
            label: 'Xapiri Thëpë',
            karma: 80,
            attributes: {
                agility: { min: 2, max: 7, aug_max: 10 },
                logic: { min: 1, max: 5, aug_max: 7 },
                charisma: { min: 2, max: 7, aug_max: 10 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Xapiri Thëpë metavariant with Photometabolism and Low-Light Vision.',
        },
    ],
    dwarf: [
        {
            name: 'Gnome',
            label: 'Gnome',
            karma: 50,
            attributes: {
                body: { min: 1, max: 4, aug_max: 6 },
                agility: { min: 2, max: 7, aug_max: 10 },
                strength: { min: 1, max: 4, aug_max: 6 },
                willpower: { min: 2, max: 7, aug_max: 10 },
                logic: { min: 2, max: 7, aug_max: 10 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Gnome metavariant with Arcane Arrester 2, Neoteny, and Thermographic Vision.',
        },
        {
            name: 'Hanuman',
            label: 'Hanuman',
            karma: 100,
            attributes: {
                body: { min: 1, max: 6, aug_max: 9 },
                agility: { min: 2, max: 7, aug_max: 10 },
                strength: { min: 2, max: 7, aug_max: 10 },
                logic: { min: 1, max: 5, aug_max: 7 },
                intuition: { min: 2, max: 7, aug_max: 10 },
                charisma: { min: 1, max: 5, aug_max: 7 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Hanuman metavariant with Prehensile Tail, Monkey Feet, and Thermographic Vision.',
        },
        {
            name: 'Koborokuru',
            label: 'Koborokuru',
            karma: 70,
            attributes: {
                body: { min: 2, max: 7, aug_max: 10 },
                strength: { min: 2, max: 7, aug_max: 10 },
                willpower: { min: 2, max: 7, aug_max: 10 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Koborokuru metavariant with Celerity, Resistance to Pathogens, and Thermographic Vision.',
        },
        {
            name: 'Menehune',
            label: 'Menehune',
            karma: 50,
            attributes: {
                body: { min: 2, max: 7, aug_max: 10 },
                agility: { min: 2, max: 7, aug_max: 10 },
                reaction: { min: 1, max: 5, aug_max: 7 },
                strength: { min: 2, max: 7, aug_max: 10 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Menehune metavariant with Underwater Vision, Webbed Digits, and Thermographic Vision.',
        },
    ],
    ork: [
        {
            name: 'Hobgoblin',
            label: 'Hobgoblin',
            karma: 40,
            attributes: {
                body: { min: 1, max: 6, aug_max: 9 },
                strength: { min: 2, max: 7, aug_max: 10 },
                logic: { min: 1, max: 5, aug_max: 7 },
                charisma: { min: 2, max: 7, aug_max: 10 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Hobgoblin metavariant with Fangs, Vindictive, and Low-Light Vision.',
        },
        {
            name: 'Ogre',
            label: 'Ogre',
            karma: 40,
            attributes: {
                body: { min: 4, max: 9, aug_max: 13 },
                reaction: { min: 1, max: 5, aug_max: 7 },
                strength: { min: 3, max: 8, aug_max: 12 },
                willpower: { min: 2, max: 7, aug_max: 10 },
                logic: { min: 1, max: 5, aug_max: 7 },
                charisma: { min: 1, max: 4, aug_max: 6 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Ogre metavariant with Ogre Stomach and Low-Light Vision.',
        },
        {
            name: 'Oni',
            label: 'Oni',
            karma: 50,
            attributes: {
                body: { min: 3, max: 8, aug_max: 12 },
                agility: { min: 2, max: 7, aug_max: 10 },
                strength: { min: 2, max: 7, aug_max: 10 },
                logic: { min: 1, max: 5, aug_max: 7 },
                charisma: { min: 2, max: 7, aug_max: 10 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Oni metavariant with Striking Skin Pigmentation and Low-Light Vision.',
        },
        {
            name: 'Satyr',
            label: 'Satyr',
            karma: 50,
            attributes: {
                body: { min: 2, max: 7, aug_max: 10 },
                reaction: { min: 2, max: 7, aug_max: 10 },
                strength: { min: 2, max: 7, aug_max: 10 },
                charisma: { min: 1, max: 5, aug_max: 7 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Satyr metavariant with Satyr Legs and Low-Light Vision.',
        },
    ],
    troll: [
        {
            name: 'Cyclops',
            label: 'Cyclops',
            karma: 100,
            attributes: {
                body: { min: 5, max: 10, aug_max: 15 },
                agility: { min: 1, max: 5, aug_max: 7 },
                strength: { min: 6, max: 11, aug_max: 16 },
                logic: { min: 1, max: 4, aug_max: 6 },
                intuition: { min: 1, max: 5, aug_max: 7 },
                charisma: { min: 1, max: 4, aug_max: 6 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Cyclops metavariant with Cyclopean Eye, Reach +1, and Thermographic Vision.',
        },
        {
            name: 'Fomorian',
            label: 'Fomorian',
            karma: 100,
            attributes: {
                body: { min: 4, max: 9, aug_max: 13 },
                agility: { min: 1, max: 5, aug_max: 7 },
                strength: { min: 5, max: 10, aug_max: 15 },
                willpower: { min: 1, max: 5, aug_max: 7 },
                logic: { min: 1, max: 4, aug_max: 6 },
                intuition: { min: 1, max: 4, aug_max: 6 },
                charisma: { min: 1, max: 5, aug_max: 7 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Fomorian metavariant with Arcane Arrester 1, Reach +1, and Thermographic Vision.',
        },
        {
            name: 'Giant',
            label: 'Giant',
            karma: 90,
            attributes: {
                body: { min: 5, max: 10, aug_max: 15 },
                agility: { min: 1, max: 5, aug_max: 7 },
                reaction: { min: 1, max: 5, aug_max: 7 },
                strength: { min: 5, max: 10, aug_max: 15 },
                logic: { min: 1, max: 5, aug_max: 7 },
                intuition: { min: 1, max: 5, aug_max: 7 },
                charisma: { min: 1, max: 5, aug_max: 7 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Giant metavariant with Bark Skin, Reach +1, and Thermographic Vision.',
        },
        {
            name: 'Minotaur',
            label: 'Minotaur',
            karma: 100,
            attributes: {
                body: { min: 6, max: 11, aug_max: 16 },
                agility: { min: 1, max: 5, aug_max: 7 },
                strength: { min: 5, max: 10, aug_max: 15 },
                logic: { min: 1, max: 5, aug_max: 7 },
                charisma: { min: 1, max: 4, aug_max: 6 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Minotaur metavariant with Goring Horns, Reach +1, and Thermographic Vision.',
        },
    ],
    human: [
        {
            name: 'Nartaki',
            label: 'Nartaki',
            karma: 40,
            attributes: {
                edge: { min: 1, max: 6, aug_max: 9 },
            },
            qualities: [],
            weapons: [],
            items: [],
            description: 'Nartaki metavariant with Shiva Arms and Striking Skin Pigmentation.',
        },
    ],
};

export class RacePresets {
    /**
     * Create the default base Human race item creation data.
     */
    static createDefaultHumanRaceItemData(): Record<string, any> {
        const humanPreset = RACE_PRESETS.human;
        return {
            name: humanPreset.name,
            type: 'race',
            img: 'icons/svg/mystery-man.svg',
            system: {
                description: {
                    value: humanPreset.description,
                    chat: '',
                    source: 'SR5',
                },
                race: humanPreset.name,
                label: humanPreset.label,
                subtype: humanPreset.subtype,
                activeVariant: humanPreset.baseMetavariant.name,
                metavariants: {
                    [humanPreset.baseMetavariant.name]: { ...humanPreset.baseMetavariant },
                },
            },
        };
    }

    /**
     * Get race creation data for one of the 5 base races.
     */
    static createBaseRaceItemData(key: keyof typeof RACE_PRESETS): Record<string, any> | undefined {
        const preset = RACE_PRESETS[key];
        if (!preset) return undefined;

        return {
            name: preset.name,
            type: 'race',
            img: 'icons/svg/mystery-man.svg',
            system: {
                description: {
                    value: preset.description,
                    chat: '',
                    source: 'SR5',
                },
                race: preset.name,
                label: preset.label,
                subtype: preset.subtype,
                activeVariant: preset.baseMetavariant.name,
                metavariants: {
                    [preset.baseMetavariant.name]: { ...preset.baseMetavariant },
                },
            },
        };
    }
}
