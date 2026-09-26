import { TestCreator } from "@/module/tests/TestCreator";
import { SR5TestFactory } from "./utils";
import { QuenchBatchContext } from "@ethaks/fvtt-quench";
import { SR5 } from '@/module/config';
import { RiggerFlow } from '@/module/flows/RiggerFlow';
import { RiggingRules } from '@/module/rules/RiggingRules';

export const shadowrunRiggerTesting = (context: QuenchBatchContext) => {
    const factory = new SR5TestFactory();
    const { describe, it, after } = context;
    const assert: Chai.AssertStatic = context.assert;

    after(async () => { await factory.destroy(); });

    const testOptions = { showDialog: false, showMessage: false };

    const createDriver = async () => {
        const actor = await factory.createActor({ type: 'character',
            system: {
                attributes: {
                    intuition: { base: 5, },
                    reaction: { base: 3, },
                    agility: { base: 3, },
                    logic: { base: 5, }
                },
                skills: {
                    active: {
                        gunnery: { base: 5, attribute: 'agility' },
                        pilot_ground_craft: { base: 5, attribute: 'reaction' },
                        perception: { base: 4, attribute: 'intuition' }
                    }
                },
                matrix: {
                    hot_sim: true,
                    vr: true,
                    running_silent: false,
                },
                values: {
                    control_rig_rating: { base: 3 },
                }
            }
        });

        const gunnery = actor.items.get(actor.system.skills.active.gunnery?.id);
        await gunnery?.update({ system: { skill: { rating: 5 }}});
        const pilot_ground_craft = actor.items.get(actor.system.skills.active.pilot_ground_craft?.id);
        await pilot_ground_craft?.update({ system: { skill: { rating: 5 }} });
        const perception = actor.items.get(actor.system.skills.active.perception?.id);
        await perception?.update({ system: { skill: { rating: 4 }} });
        
        return actor;
    }

    const createVehicle = async () => {
        return await factory.createActor({ type: 'vehicle',
            system: {
                controlMode: 'rigger',
                vehicleType: 'ground',
                vehicle_stats: {
                    handling: { base: 3 },
                    speed: { base: 3 },
                    sensor: {base: 4}
                }
            }
        });
    }

    describe('Rigger Testing', () => {
        it('Builds handling click-roll action as Reaction + related Pilot with handling limit', async () => {
            const vehicle = await createVehicle();
            const driver = await createDriver();
            await vehicle.addVehicleDriver(driver.uuid);

            const action = vehicle.vehiclePilotActionData('handling');
            assert.notEqual(action, undefined);
            assert.equal(action!.attribute, 'reaction');
            assert.equal(action!.skill, vehicle.getVehicleTypeSkillName());
            assert.equal(action!.limit.attribute, 'handling');

            const test = await TestCreator.fromAction(action!, vehicle, testOptions);
            assert.notEqual(test, undefined);
            await test!.execute();

            // Pool should include mental substitution + pilot + hot sim + control rig.
            assert.equal(test!.pool.value, 15);
            // handling limit + control rig
            assert.equal(test!.limit.value, 6);
        });

        it('Builds speed click-roll action as Reaction + related Pilot with speed limit', async () => {
            const vehicle = await createVehicle();
            const driver = await createDriver();
            await vehicle.addVehicleDriver(driver.uuid);

            const action = vehicle.vehiclePilotActionData('speed');
            assert.notEqual(action, undefined);
            assert.equal(action!.attribute, 'reaction');
            assert.equal(action!.skill, vehicle.getVehicleTypeSkillName());
            assert.equal(action!.limit.attribute, 'speed');

            const test = await TestCreator.fromAction(action!, vehicle, testOptions);
            assert.notEqual(test, undefined);
            await test!.execute();

            // speed limit + control rig
            assert.equal(test!.limit.value, 6);
        });

        it('Jump into a Vehicle and Perform Driving Test', async () => {
            const vehicle = await createVehicle();
            const driver = await createDriver();
            await vehicle.addVehicleDriver(driver.uuid);

            const test = await TestCreator.fromPackAction(SR5.packNames.GeneralActionsPack, 'drone_pilot_vehicle', vehicle, testOptions);
            assert.notEqual(test, undefined);
            await test!.execute();
            // dicepool should be Intuition + Pilot + Hot Sim + Control Rig
            assert.equal(test!.pool.value, 15);
            // limit should be Control Rig + Handling/Speed
            assert.equal(test!.limit.value, 6);
        });

        it('Jump into a Vehicle and Perform Drone Perception', async () => {
            const vehicle = await createVehicle();
            const driver = await createDriver();
            await vehicle.addVehicleDriver(driver.uuid);

            const test = await TestCreator.fromPackAction(SR5.packNames.GeneralActionsPack, 'drone_perception', vehicle, testOptions);
            assert.notEqual(test, undefined);
            await test!.execute();
            // dicepool should be Intuition + Pilot + Hot Sim + Control Rig
            // SR5 266 VR and Rigging -- I'm interpreting that to mean Sensor tests are Vehicle Tests
            assert.equal(test!.pool.value, 14);
            // limit should be Sensor + Control Rig
            assert.equal(test!.limit.value, 7);
        });

        it('Applies vehicle hurt penalty to handling limits during rolls only', async () => {
            const vehicle = await createVehicle();
            const driver = await createDriver();
            await vehicle.addVehicleDriver(driver.uuid);

            await vehicle.update({
                system: {
                    environment: 'handling',
                    track: { physical: { value: 3 } }
                }
            });

            // Sheet values remain unchanged.
            assert.equal(vehicle.system.vehicle_stats.handling.value, 3);

            const test = await TestCreator.fromPackAction(SR5.packNames.GeneralActionsPack, 'drone_pilot_vehicle', vehicle, testOptions);
            assert.notEqual(test, undefined);
            await test!.execute();

            // pool should not receive vehicle hurt directly
            assert.equal(test!.pool.value, 15);
            // handling limit (3) + control rig (3) + hurt (-1)
            assert.equal(test!.limit.value, 5);
        });

        it('Does not apply vehicle hurt penalty to non-handling limits', async () => {
            const vehicle = await createVehicle();
            const driver = await createDriver();
            await vehicle.addVehicleDriver(driver.uuid);

            await vehicle.update({ system: { track: { physical: { value: 6 } } } });

            const test = await TestCreator.fromPackAction(SR5.packNames.GeneralActionsPack, 'drone_perception', vehicle, testOptions);
            assert.notEqual(test, undefined);
            await test!.execute();

            // sensor limit + control rig, unaffected by hurt
            assert.equal(test!.limit.value, 7);
        });

        it('Does not apply damaged-vehicle penalty to speed-based pilot click rolls', async () => {
            const vehicle = await createVehicle();
            const driver = await createDriver();
            await vehicle.addVehicleDriver(driver.uuid);

            await vehicle.update({ system: { track: { physical: { value: 6 } } } });

            const action = vehicle.vehiclePilotActionData('speed');
            assert.notEqual(action, undefined);

            const test = await TestCreator.fromAction(action!, vehicle, testOptions);
            assert.notEqual(test, undefined);
            await test!.execute();

            // speed limit + control rig, unaffected by vehicle damaged handling penalty
            assert.equal(test!.limit.value, 6);
        });

        it('Toggles drone between autopilot and remote RCC mode and resets unjumped drones to autopilot on jump-in', async () => {
            const driver = await createDriver();
            const droneA = await factory.createActor({
                type: 'vehicle',
                system: {
                    isDrone: true,
                    controlMode: 'autopilot',
                    vehicleType: 'ground'
                }
            });
            const droneB = await factory.createActor({
                type: 'vehicle',
                system: {
                    isDrone: true,
                    controlMode: 'autopilot',
                    vehicleType: 'air'
                }
            });

            await droneA.addVehicleDriver(driver.uuid);
            await droneB.addVehicleDriver(driver.uuid);

            // Toggle Drone B to remote (RCC mode)
            await droneB.update({ system: { controlMode: 'remote' } });
            assert.equal(droneB.system.controlMode, 'remote');

            // Jump driver into Drone A
            await RiggerFlow.jumpIn(driver, droneA);

            // Drone A should be rigger mode
            assert.equal(droneA.system.controlMode, 'rigger');

            // Drone B should have been automatically reset to autopilot mode
            assert.equal(droneB.system.controlMode, 'autopilot');

            // Jump out of Drone A
            await RiggerFlow.jumpOut(driver, droneA);

            // Drone A should revert to autopilot mode
            assert.equal(droneA.system.controlMode, 'autopilot');
        });

        it('Calculates max autosoft slots and resolves local autosoft rating for autonomous drones', async () => {
            const drone = await factory.createActor({
                type: 'vehicle',
                system: {
                    isDrone: true,
                    controlMode: 'autopilot',
                    vehicle_stats: {
                        pilot: { base: 4 },
                        sensor: { base: 3 }
                    }
                }
            });

            assert.equal(RiggingRules.getMaxAutosoftSlots(drone), 2);

            // Add local Clearsight autosoft
            const autosoft = await factory.createItem({
                type: 'program',
                system: {
                    type: 'autosoft',
                    autosoftType: 'clearsight',
                    technology: { rating: 3, equipped: true }
                }
            }, { parent: drone } as any);

            const effective = RiggingRules.getEffectiveAutosoft(drone, 'clearsight');
            assert.equal(effective.rating, 3);
            assert.equal(effective.source, 'local');

            const test = await TestCreator.fromPackAction(SR5.packNames.GeneralActionsPack, 'drone_perception', drone, testOptions);
            assert.notEqual(test, undefined);
            await test!.execute();

            // Dice pool should be Pilot (4) + Clearsight Autosoft (3) = 7
            assert.equal(test!.pool.value, 7);
        });

        it('Inherits RCC loaded autosofts for slaved drones when no local autosofts are active', async () => {
            const driver = await createDriver();

            // Create RCC device item on driver
            const rcc = await factory.createItem({
                type: 'device',
                system: {
                    category: 'rcc',
                    sharing: 3,
                    noise_reduction: 2,
                    technology: { rating: 5, equipped: true }
                }
            }, { parent: driver } as any);

            // Add shared autosoft to RCC owner
            await factory.createItem({
                type: 'program',
                system: {
                    type: 'autosoft',
                    autosoftType: 'maneuvering',
                    technology: { rating: 4, equipped: true }
                }
            }, { parent: driver } as any);

            const rccInfo = RiggingRules.getRCCSharingInfo(rcc);
            assert.equal(rccInfo.sharing, 3);
            assert.equal(rccInfo.isOverAllocated, false);
            assert.equal(rccInfo.loadedAutosoftsCount, 1);

            // Create drone slaved to RCC
            const drone = await factory.createActor({
                type: 'vehicle',
                system: {
                    isDrone: true,
                    controlMode: 'autopilot',
                    master: rcc.uuid,
                    vehicle_stats: {
                        pilot: { base: 3 },
                        handling: { base: 4 },
                        speed: { base: 4 }
                    }
                }
            });

            const effective = RiggingRules.getEffectiveAutosoft(drone, 'maneuvering');
            assert.equal(effective.rating, 4);
            assert.equal(effective.source, 'rcc');
        });

        it('Clamps noise reduction in _preUpdate when sharing + noise reduction exceeds device rating', async () => {
            const driver = await createDriver();

            const rcc = await factory.createItem({
                type: 'device',
                system: {
                    category: 'rcc',
                    sharing: 3,
                    noise_reduction: 2,
                    technology: { rating: 5, equipped: true }
                }
            }, { parent: driver } as any);

            assert.equal(rcc.getRating(), 5);

            // Update sharing so total sharing (5) + noise_reduction (2) would be 7 > 5
            await rcc.update({ system: { sharing: 5 } });

            // Hardware device rating stays 5, noise_reduction clamped to 0
            assert.equal(rcc.getRating(), 5);
            assert.equal((rcc.system as any).sharing, 5);
            assert.equal((rcc.system as any).noise_reduction, 0);
        });

        it('Calculates Drone Swarm Pilot rating and applies Swarm bonus to autonomous rolls', async () => {
            const droneLeader = await factory.createActor({
                type: 'vehicle',
                system: {
                    isDrone: true,
                    swarm: {
                        active: true,
                        count: 3
                    },
                    controlMode: 'autopilot',
                    vehicle_stats: {
                        pilot: { base: 3 },
                        sensor: { base: 3 }
                    }
                }
            });

            const swarmInfo = RiggingRules.getSwarmPilotInfo(droneLeader);
            // Pilot in swarm (3) + (3 drones - 1) = 5.
            assert.equal(swarmInfo.highestPilot, 3);
            assert.equal(swarmInfo.memberCount, 3);
            assert.equal(swarmInfo.swarmPilot, 5);
            // Leader pilot is 3, so bonus = 5 - 3 = 2.
            assert.equal(swarmInfo.bonus, 2);

            const test = await TestCreator.fromPackAction(SR5.packNames.GeneralActionsPack, 'drone_perception', droneLeader, testOptions);
            assert.notEqual(test, undefined);
            await test!.execute();

            // Dice pool should include Pilot (3) + Swarm Bonus (2) = 5
            assert.equal(test!.pool.value, 5);
        });

        it('Renders character sheet and vehicle sheet inventory tabs without template missing errors', async () => {
            const character = await createDriver();
            const vehicle = await createVehicle();

            const charSheet = character.sheet;
            assert.ok(charSheet);
            await charSheet!.render(true);
            await new Promise(resolve => setTimeout(resolve, 100));
            await charSheet!.close();

            const vehicleSheet = vehicle.sheet;
            assert.ok(vehicleSheet);
            await vehicleSheet!.render(true);
            await new Promise(resolve => setTimeout(resolve, 100));
            await vehicleSheet!.close();
        });

        it('Transfers driver attributes, skills, and control rig modifiers to vehicle on jumpIn and resets on jumpOut', async () => {
            const driver = await createDriver();
            const vehicle = await factory.createActor({
                type: 'vehicle',
                system: {
                    controlMode: 'autopilot',
                    vehicleType: 'ground',
                    isDrone: true,
                    vehicle_stats: {
                        handling: { base: 3 },
                        speed: { base: 3 },
                        sensor: { base: 4 }
                    }
                }
            });

            // Before jump in
            assert.equal(vehicle.system.controlMode, 'autopilot');
            assert.equal(vehicle.system.vehicle_stats.handling.value, 3);
            assert.equal(vehicle.system.vehicle_stats.speed.value, 3);

            // Jump in
            await RiggerFlow.jumpIn(driver, vehicle);

            assert.equal(vehicle.system.controlMode, 'rigger');
            // No ActiveEffects created on vehicle
            assert.isFalse(vehicle.effects.some(e => e.getFlag('shadowrun5e', 'isJumpedInEffect') === true));
            // Sheet stats remain base, roll limits get control rig bonus
            assert.equal(vehicle.system.vehicle_stats.handling.value, 3);
            assert.equal(vehicle.system.vehicle_stats.speed.value, 3);
            const rollTest = await TestCreator.fromPackAction(SR5.packNames.GeneralActionsPack, 'drone_pilot_vehicle', vehicle, testOptions);
            assert.notEqual(rollTest, undefined);
            await rollTest!.execute();
            assert.equal(rollTest!.limit.value, 6);
            // Driver mental and physical attributes transferred
            assert.equal(vehicle.system.attributes.logic.value, 5);
            assert.equal(vehicle.system.attributes.intuition.value, 5);
            assert.equal(vehicle.system.attributes.reaction.value, 3);
            assert.equal(vehicle.system.attributes.agility.value, 3);
            // Driver skills transferred
            assert.equal(vehicle.system.skills.active.pilot_ground_craft.value, 5);
            assert.equal(vehicle.system.skills.active.gunnery.value, 5);
            assert.equal(vehicle.system.skills.active.perception.value, 4);

            // Jump out
            await RiggerFlow.jumpOut(driver, vehicle);

            assert.equal(vehicle.system.controlMode, 'autopilot');
            assert.equal(vehicle.system.vehicle_stats.handling.value, 3);
            assert.equal(vehicle.system.vehicle_stats.speed.value, 3);
            assert.isTrue(!vehicle.system.skills.active.pilot_ground_craft || vehicle.system.skills.active.pilot_ground_craft.value === 0);
        });

        it('Sets all other vehicles/drones of the player actor to autopilot when jumping in', async () => {
            const driver = await createDriver();
            const vehicle1 = await factory.createActor({
                type: 'vehicle',
                system: {
                    controlMode: 'manual',
                    vehicleType: 'ground',
                    isDrone: true,
                    driver: driver.uuid
                }
            });
            const vehicle2 = await factory.createActor({
                type: 'vehicle',
                system: {
                    controlMode: 'manual',
                    vehicleType: 'ground',
                    isDrone: true,
                    driver: driver.uuid
                }
            });

            assert.equal(vehicle1.system.controlMode, 'manual');
            assert.equal(vehicle2.system.controlMode, 'manual');

            // Jump into vehicle 1
            await RiggerFlow.jumpIn(driver, vehicle1);

            assert.equal(vehicle1.system.controlMode, 'rigger');
            assert.equal(vehicle2.system.controlMode, 'autopilot');

            // Clean up
            await RiggerFlow.jumpOut(driver, vehicle1);
        });

        describe('Drone Swarms', () => {
            it('Calculates mixed drone swarm stats according to Rigger 5.0 rules', async () => {
                const drone1 = await factory.createActor({
                    type: 'vehicle',
                    name: 'MCT-FlySpy Leader',
                    system: {
                        isDrone: true,
                        vehicleType: 'air',
                        vehicle_stats: {
                            pilot: { base: 2 },
                            sensor: { base: 2 },
                            handling: { base: 4 },
                            speed: { base: 3 },
                            acceleration: { base: 2 }
                        }
                    }
                });

                const drone2 = await factory.createActor({
                    type: 'vehicle',
                    name: 'Doberman Companion',
                    system: {
                        isDrone: true,
                        vehicleType: 'ground',
                        vehicle_stats: {
                            pilot: { base: 3 },
                            sensor: { base: 4 },
                            handling: { base: 3 },
                            speed: { base: 4 },
                            acceleration: { base: 1 }
                        }
                    }
                });

                const drone3 = await factory.createActor({
                    type: 'vehicle',
                    name: 'Rotodrone Companion',
                    system: {
                        isDrone: true,
                        vehicleType: 'air',
                        vehicle_stats: {
                            pilot: { base: 1 },
                            sensor: { base: 3 },
                            handling: { base: 5 },
                            speed: { base: 2 },
                            acceleration: { base: 3 }
                        }
                    }
                });

                // Test without RCC:
                // Count = 3
                // Pilot = highest member pilot (3) + (3 - 1) = 5
                // Sensor = highest member sensor = 4
                // Handling = lowest member handling = 3
                // Speed = lowest member speed = 2
                // Acceleration = lowest member acceleration = 1
                const statsWithoutRcc = RiggingRules.getSwarmStats(drone1, [drone1, drone2, drone3], null);
                assert.equal(statsWithoutRcc.memberCount, 3);
                assert.equal(statsWithoutRcc.swarmPilot, 5);
                assert.equal(statsWithoutRcc.highestSensor, 4);
                assert.equal(statsWithoutRcc.lowestHandling, 3);
                assert.equal(statsWithoutRcc.lowestSpeed, 2);
                assert.equal(statsWithoutRcc.lowestAcceleration, 1);

                // Test with RCC: Device Rating 5
                // Pilot = max(RCC Device Rating (5), highest member pilot (3)) + (3 - 1) = 5 + 2 = 7
                const rcc = await factory.createItem({
                    type: 'device',
                    name: 'Vulcan LiegeLord',
                    system: {
                        category: 'rcc',
                        technology: {
                            rating: 5,
                            equipped: true
                        }
                    }
                });
                const statsWithRcc = RiggingRules.getSwarmStats(drone1, [drone1, drone2, drone3], rcc);
                assert.equal(statsWithRcc.swarmPilot, 7);
            });

            it('Pools autosofts across swarm members without duplicates and takes highest rating', async () => {
                const drone1 = await factory.createActor({
                    type: 'vehicle',
                    name: 'Drone 1',
                    system: { isDrone: true, vehicleType: 'air', vehicle_stats: { pilot: { base: 2 } } }
                });
                const drone2 = await factory.createActor({
                    type: 'vehicle',
                    name: 'Drone 2',
                    system: { isDrone: true, vehicleType: 'air', vehicle_stats: { pilot: { base: 2 } } }
                });

                // Add Clearsight 3 to Drone 1
                await drone1.createEmbeddedDocuments('Item', [{
                    name: 'Clearsight 3',
                    type: 'program',
                    system: {
                        type: 'autosoft',
                        autosoftType: 'clearsight',
                        technology: { rating: 3, equipped: true }
                    }
                }]);

                // Add Clearsight 5 and Maneuvering 4 to Drone 2
                await drone2.createEmbeddedDocuments('Item', [
                    {
                        name: 'Clearsight 5',
                        type: 'program',
                        system: {
                            type: 'autosoft',
                            autosoftType: 'clearsight',
                            technology: { rating: 5, equipped: true }
                        }
                    },
                    {
                        name: 'Maneuvering [Drone 2] 4',
                        type: 'program',
                        system: {
                            type: 'autosoft',
                            autosoftType: 'maneuvering',
                            targetModel: 'Drone 2',
                            technology: { rating: 4, equipped: true }
                        }
                    }
                ]);

                const stats = RiggingRules.getSwarmStats(drone1, [drone1, drone2], null);
                assert.equal(stats.sharedAutosofts.length, 2);

                const clearsight = stats.sharedAutosofts.find(a => a.autosoftType === 'clearsight');
                assert.notEqual(clearsight, undefined);
                assert.equal(clearsight!.rating, 5);

                const maneuvering = stats.sharedAutosofts.find(a => a.autosoftType === 'maneuvering');
                assert.notEqual(maneuvering, undefined);
                assert.equal(maneuvering!.rating, 4);
            });

            it('Synchronizes swarm companion token positions and locks selection/dragging', async () => {
                const scene = await factory.createScene({ name: 'Swarm Test Scene' });
                const leaderActor = await factory.createActor({
                    type: 'vehicle',
                    name: 'Leader Drone',
                    system: { isDrone: true, vehicleType: 'air', swarm: { active: true, count: 2 } }
                });
                const companionActor = await factory.createActor({
                    type: 'vehicle',
                    name: 'Companion Drone',
                    system: { isDrone: true, vehicleType: 'air' }
                });

                const [leaderTokenDoc] = await scene.createEmbeddedDocuments('Token', [{
                    name: 'Leader Token',
                    actorId: leaderActor.id,
                    actorLink: true,
                    x: 100,
                    y: 100,
                    flags: {
                        shadowrun5e: {
                            isSwarmLeader: true,
                            swarmCompanionTokenIds: []
                        }
                    }
                }]);

                const [companionTokenDoc] = await scene.createEmbeddedDocuments('Token', [{
                    name: 'Companion Token',
                    actorId: companionActor.id,
                    actorLink: true,
                    x: 160,
                    y: 140,
                    flags: {
                        shadowrun5e: {
                            isSwarmCompanion: true,
                            swarmLeaderTokenId: leaderTokenDoc.id,
                            swarmRelativeOffset: { dx: 60, dy: 40 }
                        }
                    }
                }]);

                await leaderTokenDoc.setFlag('shadowrun5e', 'swarmCompanionTokenIds', [companionTokenDoc.id]);

                // Check companion token flags and control/drag restrictions
                assert.isTrue(Boolean(companionTokenDoc.getFlag('shadowrun5e', 'isSwarmCompanion')));
                if (companionTokenDoc.object) {
                    assert.isFalse((companionTokenDoc.object as any)._canControl(game.user));
                    assert.isFalse((companionTokenDoc.object as any)._canDrag(game.user));
                }

                // Move leader token: from (100, 100) to (300, 200)
                await leaderTokenDoc.update({ x: 300, y: 200 });
                if ((leaderTokenDoc as any).swarmSyncPromise) {
                    await (leaderTokenDoc as any).swarmSyncPromise;
                }

                // Companion token should follow offset { dx: 60, dy: 40 } -> (360, 240)
                const updatedCompanion = scene.tokens.get(companionTokenDoc.id);
                assert.notEqual(updatedCompanion, undefined);
                assert.equal(updatedCompanion!.x, 360);
                assert.equal(updatedCompanion!.y, 240);

                // Deleting companion token updates leader's companion list and swarm count
                await companionTokenDoc.delete();
                const updatedLeaderCompanions = leaderTokenDoc.getFlag('shadowrun5e', 'swarmCompanionTokenIds') as string[];
                assert.isFalse(updatedLeaderCompanions.includes(companionTokenDoc.id));
                assert.equal(leaderActor.system.swarm.count, 1);
            });
        });
    });
};
