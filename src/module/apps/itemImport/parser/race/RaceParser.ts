import { Parser } from '../Parser';
import { Metatype } from '../../schema/MetatypeSchema';
import { CompendiumKey } from '../../importer/Constants';
import { ImportHelper as IH } from '../../helper/ImportHelper';
import { SR5 } from '@/module/config';

export class RaceParser extends Parser<'race'> {
    protected readonly parseType = 'race';

    private parseRange(minText?: { _TEXT: any }, maxText?: { _TEXT: any }, augText?: { _TEXT: any }) {
        const min = Number(minText?._TEXT) || 1;
        const max = Number(maxText?._TEXT) || 6;
        const aug_max = Number(augText?._TEXT) || (max + 4);
        return { min, max, aug_max };
    }

    protected override getSystem(jsonData: Metatype) {
        const system = this.getBaseSystem();

        const rawName = (jsonData.name?._TEXT || '').toLowerCase();
        const baseRaces = Object.keys((CONFIG as any)?.SR5?.races || SR5.races);
        const matchedRace = baseRaces.find(r => rawName.includes(r)) || 'human';

        system.race = matchedRace;
        system.subtype = 'metahuman';
        system.karma = Number(jsonData.karma?._TEXT) || 0;

        system.attributes = {
            body: this.parseRange(jsonData.bodmin, jsonData.bodmax, jsonData.bodaug),
            agility: this.parseRange(jsonData.agimin, jsonData.agimax, jsonData.agiaug),
            reaction: this.parseRange(jsonData.reamin, jsonData.reamax, jsonData.reaaug),
            strength: this.parseRange(jsonData.strmin, jsonData.strmax, jsonData.straug),
            willpower: this.parseRange(jsonData.wilmin, jsonData.wilmax, jsonData.wilaug),
            logic: this.parseRange(jsonData.logmin, jsonData.logmax, jsonData.logaug),
            intuition: this.parseRange(jsonData.intmin, jsonData.intmax, jsonData.intaug),
            charisma: this.parseRange(jsonData.chamin, jsonData.chamax, jsonData.chaaug),
            edge: this.parseRange(jsonData.edgmin, jsonData.edgmax, jsonData.edgaug),
        };

        // Source description value is kept clean
        system.description.value = '';

        return system;
    }

    protected override async getFolder(jsonData: Metatype, compendiumKey: CompendiumKey): Promise<Folder> {
        const rootFolder = game.i18n.localize('SR5.ItemTypes.Race');
        const folderName = jsonData.category?._TEXT || 'Metahuman';
        return IH.getFolder(compendiumKey, rootFolder, folderName);
    }
}
