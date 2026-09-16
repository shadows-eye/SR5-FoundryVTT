import { SR5TestFactory } from './utils';
import { QuenchBatchContext } from '@ethaks/fvtt-quench';
import { MetatypeFlow } from '@/module/flows/MetatypeFlow';
import { SR5Item } from '@/module/item/SR5Item';

const sampleHumanData: Item.CreateData<'metatype'> = {
    name: 'Human',
    type: 'metatype',
    system: {
        metatype: 'human',
        subtype: 'metahuman',
        karma: 0,
        attributes: {
            body: { min: 1, max: 6, aug_max: 9 },
            edge: { min: 2, max: 7, aug_max: 10 },
        },
        qualities: [],
        weapons: [],
        items: [],
    },
};

const sampleElfData: Item.CreateData<'metatype'> = {
    name: 'Elf',
    type: 'metatype',
    system: {
        metatype: 'elf',
        subtype: 'metahuman',
        karma: 40,
        attributes: {
            agility: { min: 2, max: 7, aug_max: 10 },
            charisma: { min: 3, max: 8, aug_max: 12 },
        },
        qualities: [
            'Compendium.shadowrun5e.sr5e-qualities.Item.quality00lowlight',
        ],
        weapons: [],
        items: [],
    },
};

export const shadowrunMetatypeItemTesting = (context: QuenchBatchContext) => {
    const factory = new SR5TestFactory();
    const { describe, it, after } = context;
    const assert: Chai.AssertStatic = context.assert;

    after(async () => {
        await factory.destroy();
    });

    describe('Metatype Item and Metavariants', () => {
        it('Metatype DataModel initializes correctly with attributes, trait UUIDs, and getters', async () => {
            const metatypeItem = await factory.createItem(sampleElfData) as SR5Item<'metatype'>;

            assert.strictEqual(metatypeItem.type, 'metatype');
            assert.strictEqual(metatypeItem.system.metatype, 'elf');
            assert.strictEqual(metatypeItem.system.karma, 40);

            // Trait UUIDs are stored as arrays of DocumentUUID strings
            assert.deepEqual(metatypeItem.system.qualities, [
                'Compendium.shadowrun5e.sr5e-qualities.Item.quality00lowlight',
            ]);
            assert.deepEqual(metatypeItem.system.weapons, []);
            assert.deepEqual(metatypeItem.system.items, []);

            const ranges = metatypeItem.system.getActiveAttributeRanges();
            assert.isDefined(ranges.agility);
            assert.strictEqual(ranges.agility.min, 2);
            assert.strictEqual(ranges.agility.max, 7);
            assert.strictEqual(ranges.agility.aug_max, 10);
            assert.strictEqual(ranges.charisma.min, 3);
            assert.strictEqual(ranges.charisma.max, 8);
        });

        it('Applying a metatype item to a character updates metatype and attribute ranges', async () => {
            const character = await factory.createActor({ type: 'character' });
            await MetatypeFlow.applyMetatypeToActor(character, sampleHumanData);

            const metatypeItem = character.items.find(i => i.isType('metatype'));
            assert.isDefined(metatypeItem, 'Character should have applied metatype item');
            assert.strictEqual(metatypeItem?.system.metatype, 'human');
            assert.strictEqual(character.system.metatype, 'Human');

            // Attributes min should be enforced from metatype ranges (e.g. body >= 1)
            assert.isAtLeast(character.system.attributes.body.value, 1);
            assert.isAtLeast(character.system.attributes.edge.value, 2);
        });

        it('Applying a new metatype item replaces existing metatype and updates metatype', async () => {
            const character = await factory.createActor({ type: 'character' });
            await MetatypeFlow.applyMetatypeToActor(character, sampleHumanData);
            assert.strictEqual(character.items.filter(i => i.isType('metatype')).length, 1);

            // Apply Elf metatype
            await MetatypeFlow.applyMetatypeToActor(character, sampleElfData);

            const updatedMetatypes = character.items.filter(i => i.isType('metatype'));
            assert.strictEqual(updatedMetatypes.length, 1, 'Actor should still only have 1 metatype item');
            assert.strictEqual(character.system.metatype, 'Elf');

            // Elf agility range: max 7, aug_max 10
            const activeMetatype = updatedMetatypes[0];
            const ranges = activeMetatype.system.getActiveAttributeRanges();
            assert.strictEqual(ranges.agility.max, 7);
            assert.strictEqual(ranges.agility.aug_max, 10);
        });

        it('Granted traits (qualities, weapons, items) are stored as UUIDs, granted on actor, and cleaned up on deletion', async () => {
            // Create trait items that represent metatype enhancements
            const lowLightQuality = await factory.createItem({
                name: 'Low-Light Vision',
                type: 'quality',
                system: {
                    type: 'positive',
                    karma: 0,
                    rating: 0,
                },
            });

            const dermalArmorWeapon = await factory.createItem({
                name: 'Troll Horns',
                type: 'weapon',
                system: {
                    category: 'melee',
                },
            });

            // Define metatype item storing trait UUIDs in qualities, weapons, and items
            const trollMetatypeData: Item.CreateData<'metatype'> = {
                name: 'Troll',
                type: 'metatype',
                system: {
                    metatype: 'troll',
                    subtype: 'metahuman',
                    karma: 90,
                    attributes: {
                        body: { min: 5, max: 10, aug_max: 15 },
                        strength: { min: 5, max: 10, aug_max: 15 },
                    },
                    qualities: [lowLightQuality.uuid],
                    weapons: [dermalArmorWeapon.uuid],
                    items: [],
                },
            };

            const metatypeItem = await factory.createItem(trollMetatypeData) as SR5Item<'metatype'>;
            assert.deepEqual(metatypeItem.system.qualities, [lowLightQuality.uuid]);
            assert.deepEqual(metatypeItem.system.weapons, [dermalArmorWeapon.uuid]);

            // Apply to character
            const character = await factory.createActor({ type: 'character' });
            await MetatypeFlow.applyMetatypeToActor(character, metatypeItem);

            // Verify granted items are copied to the actor
            const grantedQuality = character.items.find(i => i.isType('quality') && i.name === 'Low-Light Vision');
            const grantedWeapon = character.items.find(i => i.isType('weapon') && i.name === 'Troll Horns');
            assert.isDefined(grantedQuality, 'Quality trait should be granted to actor');
            assert.isDefined(grantedWeapon, 'Weapon trait should be granted to actor');

            // Verify actor's embedded metatype item has its links rewritten to actor's local item UUIDs
            const actorMetatype = character.items.find(i => i.isType('metatype'));
            assert.isDefined(actorMetatype);
            assert.deepEqual(actorMetatype!.system.qualities, [grantedQuality!.uuid]);
            assert.deepEqual(actorMetatype!.system.weapons, [grantedWeapon!.uuid]);

            // Delete the metatype item and verify granted traits are cleaned up
            await actorMetatype!.delete();
            assert.isUndefined(character.items.find(i => i.id === grantedQuality!.id));
            assert.isUndefined(character.items.find(i => i.id === grantedWeapon!.id));
        });

        it('Deleting character metatype item clears metatype link', async () => {
            const character = await factory.createActor({ type: 'character' });
            await MetatypeFlow.applyMetatypeToActor(character, sampleHumanData);
            const metatypeItem = character.items.find(i => i.isType('metatype'));
            assert.isDefined(metatypeItem);

            // Delete the metatype item
            await metatypeItem!.delete();

            const remainingMetatypes = character.items.filter(i => i.isType('metatype'));
            assert.strictEqual(remainingMetatypes.length, 0, 'Metatype item should be deleted');
            assert.strictEqual(character.system.metatypeUuid, null);
        });

        it('Base metatype items have empty descriptions and proper racialItems flags', async () => {
            const trollData: Item.CreateData<'metatype'> = {
                name: 'Troll',
                type: 'metatype',
                system: {
                    description: { value: '', chat: '', source: 'SR5' },
                    metatype: 'troll',
                    subtype: 'metahuman',
                    karma: 90,
                    attributes: { body: { min: 5, max: 10, aug_max: 15 } },
                    qualities: [
                        'Compendium.world.sr5trait.Item.vtuieKxvSSfRyB2N',
                        'Compendium.world.sr5trait.Item.fydCbpyhuL0u6dfL'
                    ],
                    weapons: [],
                    items: [],
                },
                flags: {
                    shadowrun5e: {
                        racialItems: [
                            {
                                id: 'vtuieKxvSSfRyB2N',
                                foundryUuid: 'Compendium.world.sr5trait.Item.vtuieKxvSSfRyB2N',
                                chummerId: '02e76a38-304e-4a0e-93a3-ad2938306afc',
                                name: 'Thermographic Vision',
                                type: 'quality',
                                category: 'quality'
                            },
                            {
                                id: 'fydCbpyhuL0u6dfL',
                                foundryUuid: 'Compendium.world.sr5trait.Item.fydCbpyhuL0u6dfL',
                                chummerId: '72d1d797-4b61-4fbd-97b7-ffb8ea9ddf36',
                                name: 'Dermal Deposits',
                                type: 'quality',
                                category: 'quality'
                            }
                        ]
                    }
                }
            };

            const trollItem = await factory.createItem(trollData) as SR5Item<'metatype'>;
            assert.strictEqual(trollItem.system.description.value, '', 'Metatype description should remain empty');
            assert.lengthOf(trollItem.system.qualities, 2);
            assert.strictEqual(trollItem.system.qualities[0], 'Compendium.world.sr5trait.Item.vtuieKxvSSfRyB2N');
            assert.strictEqual(trollItem.system.qualities[1], 'Compendium.world.sr5trait.Item.fydCbpyhuL0u6dfL');

            const flags = trollItem.flags?.shadowrun5e?.racialItems;
            assert.isArray(flags);
            assert.lengthOf(flags!, 2);
            assert.strictEqual(flags![0].chummerId, '02e76a38-304e-4a0e-93a3-ad2938306afc');
            assert.strictEqual(flags![1].chummerId, '72d1d797-4b61-4fbd-97b7-ffb8ea9ddf36');
        });

        it('NPC grunt metatype applies metatype modifiers to attributes', async () => {
            const grunt = await factory.createActor({
                type: 'character',
                system: {
                    is_npc: true,
                    npc: { is_grunt: true },
                    metatype: 'ork',
                }
            });
            // Ork grunt has body: +3, strength: +2
            assert.strictEqual(grunt.system.attributes.body.value, 4);
            assert.strictEqual(grunt.system.attributes.strength.value, 3);
        });
    });
};

export const shadowrunRaceItemTesting = shadowrunMetatypeItemTesting;
