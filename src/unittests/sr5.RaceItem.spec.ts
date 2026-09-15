import { SR5TestFactory } from './utils';
import { QuenchBatchContext } from '@ethaks/fvtt-quench';
import { RaceFlow } from '@/module/flows/RaceFlow';
import { SR5Item } from '@/module/item/SR5Item';

const sampleHumanData = {
    name: 'Human',
    type: 'race',
    system: {
        race: 'human',
        subtype: 'metahuman',
        karma: 0,
        attributes: {
            body: { min: 1, max: 6, aug_max: 9 },
            edge: { min: 2, max: 7, aug_max: 10 },
        },
        // Traits and enhancements stored as Document UUIDs
        qualities: [] as string[],
        weapons: [] as string[],
        items: [] as string[],
    },
};

const sampleElfData = {
    name: 'Elf',
    type: 'race',
    system: {
        race: 'elf',
        subtype: 'metahuman',
        karma: 40,
        attributes: {
            agility: { min: 2, max: 7, aug_max: 10 },
            charisma: { min: 3, max: 8, aug_max: 12 },
        },
        // Traits and enhancements stored as Document UUIDs (e.g. compendium or world UUIDs)
        qualities: [
            'Compendium.shadowrun5e.sr5e-qualities.Item.quality00lowlight',
        ],
        weapons: [] as string[],
        items: [] as string[],
    },
};

export const shadowrunRaceItemTesting = (context: QuenchBatchContext) => {
    const factory = new SR5TestFactory();
    const { describe, it, after } = context;
    const assert: Chai.AssertStatic = context.assert;

    after(async () => {
        await factory.destroy();
    });

    describe('Race Item and Metavariants', () => {
        it('Race DataModel initializes correctly with attributes, trait UUIDs, and getters', async () => {
            const raceItem = await factory.createItem(sampleElfData as any) as SR5Item<'race'>;

            assert.strictEqual(raceItem.type, 'race');
            assert.strictEqual(raceItem.system.race, 'elf');
            assert.strictEqual(raceItem.system.karma, 40);

            // Trait UUIDs are stored as arrays of DocumentUUID strings
            assert.deepEqual(raceItem.system.qualities, [
                'Compendium.shadowrun5e.sr5e-qualities.Item.quality00lowlight',
            ]);
            assert.deepEqual(raceItem.system.weapons, []);
            assert.deepEqual(raceItem.system.items, []);

            const ranges = raceItem.system.getActiveAttributeRanges();
            assert.isDefined(ranges.agility);
            assert.strictEqual(ranges.agility.min, 2);
            assert.strictEqual(ranges.agility.max, 7);
            assert.strictEqual(ranges.agility.aug_max, 10);
            assert.strictEqual(ranges.charisma.min, 3);
            assert.strictEqual(ranges.charisma.max, 8);
        });

        it('Applying a race item to a character updates metatype and attribute ranges', async () => {
            const character = await factory.createActor({ type: 'character' });
            await RaceFlow.applyRaceToActor(character, sampleHumanData as any);

            const raceItem = character.items.find(i => i.isType('race')) as SR5Item<'race'> | undefined;
            assert.isDefined(raceItem, 'Character should have applied race item');
            assert.strictEqual(raceItem?.system.race, 'human');
            assert.strictEqual(character.system.metatype, 'Human');

            // Attributes min should be enforced from racial ranges (e.g. body >= 1)
            assert.isAtLeast(character.system.attributes.body.value, 1);
            assert.isAtLeast(character.system.attributes.edge.value, 2);
        });

        it('Applying a new race item replaces existing race and updates metatype', async () => {
            const character = await factory.createActor({ type: 'character' });
            await RaceFlow.applyRaceToActor(character, sampleHumanData as any);
            assert.strictEqual(character.items.filter(i => i.isType('race')).length, 1);

            // Apply Elf race
            await RaceFlow.applyRaceToActor(character, sampleElfData as any);

            const updatedRaces = character.items.filter(i => i.isType('race'));
            assert.strictEqual(updatedRaces.length, 1, 'Actor should still only have 1 race item');
            assert.strictEqual(character.system.metatype, 'Elf');

            // Elf agility range: max 7, aug_max 10
            const activeRace = updatedRaces[0] as SR5Item<'race'>;
            const ranges = activeRace.system.getActiveAttributeRanges();
            assert.strictEqual(ranges.agility.max, 7);
            assert.strictEqual(ranges.agility.aug_max, 10);
        });

        it('Granted traits (qualities, weapons, items) are stored as UUIDs, granted on actor, and cleaned up on deletion', async () => {
            // Create trait items that represent racial enhancements
            const lowLightQuality = await factory.createItem({
                name: 'Low-Light Vision',
                type: 'quality',
                system: {
                    type: 'positive',
                    karma: 0,
                } as any,
            });

            const dermalArmorWeapon = await factory.createItem({
                name: 'Troll Horns',
                type: 'weapon',
                system: {
                    category: 'melee',
                } as any,
            });

            // Define race item storing trait UUIDs in qualities, weapons, and items
            const trollRaceData = {
                name: 'Troll',
                type: 'race',
                system: {
                    race: 'troll',
                    subtype: 'metahuman',
                    karma: 90,
                    attributes: {
                        body: { min: 5, max: 10, aug_max: 15 },
                        strength: { min: 5, max: 10, aug_max: 15 },
                    },
                    qualities: [lowLightQuality.uuid],
                    weapons: [dermalArmorWeapon.uuid],
                    items: [] as string[],
                },
            };

            const raceItem = await factory.createItem(trollRaceData as any) as SR5Item<'race'>;
            assert.deepEqual(raceItem.system.qualities, [lowLightQuality.uuid]);
            assert.deepEqual(raceItem.system.weapons, [dermalArmorWeapon.uuid]);

            // Apply to character
            const character = await factory.createActor({ type: 'character' });
            await RaceFlow.applyRaceToActor(character, raceItem);

            // Verify granted items are copied to the actor
            const grantedQuality = character.items.find(i => i.isType('quality') && i.name === 'Low-Light Vision');
            const grantedWeapon = character.items.find(i => i.isType('weapon') && i.name === 'Troll Horns');
            assert.isDefined(grantedQuality, 'Quality trait should be granted to actor');
            assert.isDefined(grantedWeapon, 'Weapon trait should be granted to actor');

            // Verify actor's embedded race item has its links rewritten to actor's local item UUIDs
            const actorRace = character.items.find(i => i.isType('race')) as SR5Item<'race'>;
            assert.deepEqual(actorRace.system.qualities, [grantedQuality!.uuid]);
            assert.deepEqual(actorRace.system.weapons, [grantedWeapon!.uuid]);

            // Delete the race item and verify granted traits are cleaned up
            await actorRace.delete();
            assert.isUndefined(character.items.find(i => i.id === grantedQuality!.id));
            assert.isUndefined(character.items.find(i => i.id === grantedWeapon!.id));
        });

        it('Deleting character race item clears race link', async () => {
            const character = await factory.createActor({ type: 'character' });
            await RaceFlow.applyRaceToActor(character, sampleHumanData as any);
            const raceItem = character.items.find(i => i.isType('race'));
            assert.isDefined(raceItem);

            // Delete the race item
            await raceItem!.delete();

            const remainingRaces = character.items.filter(i => i.isType('race'));
            assert.strictEqual(remainingRaces.length, 0, 'Race item should be deleted');
            assert.strictEqual(character.system.raceUuid, null);
        });

        it('NPC grunt metatype applies metatype modifiers to attributes', async () => {
            const grunt = await factory.createActor({
                type: 'character',
                system: {
                    is_npc: true,
                    npc: { is_grunt: true },
                    metatype: 'ork',
                } as any
            });
            // Ork grunt has body: +3, strength: +2
            assert.strictEqual(grunt.system.attributes.body.value, 4);
            assert.strictEqual(grunt.system.attributes.strength.value, 3);
        });
    });
};
