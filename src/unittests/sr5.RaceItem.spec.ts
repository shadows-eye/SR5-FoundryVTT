import { SR5TestFactory } from './utils';
import { QuenchBatchContext } from '@ethaks/fvtt-quench';
import { RacePresets } from '@/module/data/RacePresets';
import { RaceFlow } from '@/module/flows/RaceFlow';
import { SR5Item } from '@/module/item/SR5Item';

export const shadowrunRaceItemTesting = (context: QuenchBatchContext) => {
    const factory = new SR5TestFactory();
    const { describe, it, after } = context;
    const assert: Chai.AssertStatic = context.assert;

    after(async () => {
        await factory.destroy();
    });

    describe('Race Item and Metavariants', () => {
        it('Race DataModel initializes correctly with metavariants and getters', async () => {
            const humanData = RacePresets.createDefaultHumanRaceItemData();
            const raceItem = await factory.createItem(humanData as any) as SR5Item<'race'>;

            assert.strictEqual(raceItem.type, 'race');
            assert.strictEqual(raceItem.system.race, 'Human');
            assert.strictEqual(raceItem.system.activeVariant, 'Human');
            assert.strictEqual(raceItem.system.karma, 0);

            const ranges = raceItem.system.getActiveAttributeRanges();
            assert.isDefined(ranges.body);
            assert.strictEqual(ranges.body.min, 1);
            assert.strictEqual(ranges.body.max, 6);
            assert.strictEqual(ranges.body.aug_max, 9);
            assert.strictEqual(ranges.edge.min, 2);
            assert.strictEqual(ranges.edge.max, 7);
        });

        it('Character creation automatically adds default Human race item', async () => {
            const character = await factory.createActor({ type: 'character' });
            const raceItem = character.items.find(i => i.isType('race')) as SR5Item<'race'> | undefined;

            assert.isDefined(raceItem, 'Character should automatically have a race item');
            assert.strictEqual(raceItem?.system.race, 'Human');
            assert.strictEqual(raceItem?.system.activeVariant, 'Human');
            assert.strictEqual(character.system.metatype, 'Human');

            // Attributes min should be enforced from racial ranges (e.g. body >= 1)
            assert.isAtLeast(character.system.attributes.body.value, 1);
            assert.isAtLeast(character.system.attributes.edge.value, 2);
        });

        it('Active effects can boost attributes beyond range.max up to aug_max without hard clamp', async () => {
            const character = await factory.createActor({ type: 'character' });
            // Set base body to natural maximum (6)
            await character.update({ 'system.attributes.body.base': 6 } as any);
            assert.strictEqual(character.system.attributes.body.value, 6);

            // Add an ActiveEffect that adds +2 to Body
            await character.createEmbeddedDocuments('ActiveEffect', [{
                name: 'Cyberware Body Boost',
                disabled: false,
                system: {
                    changes: [{
                        key: 'system.attributes.body',
                        value: '2',
                        type: 'add',
                    }],
                },
            } as any]);

            // Value should now be 8, which exceeds natural max 6 but is within aug_max 9
            assert.strictEqual(character.system.attributes.body.value, 8);
        });

        it('Applying a new race item replaces existing race and updates metatype', async () => {
            const character = await factory.createActor({ type: 'character' });
            const initialRaces = character.items.filter(i => i.isType('race'));
            assert.strictEqual(initialRaces.length, 1);

            // Apply Elf race
            const elfItemData = RacePresets.createBaseRaceItemData('elf')!;

            await RaceFlow.applyRaceToActor(character, elfItemData, 'Elf');

            const updatedRaces = character.items.filter(i => i.isType('race'));
            assert.strictEqual(updatedRaces.length, 1, 'Actor should still only have 1 race item');
            assert.strictEqual(character.system.metatype, 'Elf');

            // Elf agility range: max 7, aug_max 10
            const activeRace = updatedRaces[0] as SR5Item<'race'>;
            const ranges = activeRace.system.getActiveAttributeRanges();
            assert.strictEqual(ranges.agility.max, 7);
            assert.strictEqual(ranges.agility.aug_max, 10);
        });

        it('Deleting character race item restores fallback Human race item', async () => {
            const character = await factory.createActor({ type: 'character' });
            const raceItem = character.items.find(i => i.isType('race'));
            assert.isDefined(raceItem);

            // Delete the race item
            await raceItem!.delete();

            // After deletion, onRaceDeleted restores fallback Human race
            const remainingRaces = character.items.filter(i => i.isType('race'));
            assert.strictEqual(remainingRaces.length, 1, 'Fallback Human should be restored');
            assert.strictEqual(character.system.metatype, 'Human');
        });
    });
};
