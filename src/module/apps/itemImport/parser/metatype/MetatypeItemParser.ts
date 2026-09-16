import { Parser } from '../Parser';
import { Metatype as MetatypeSchemaType } from '../../schema/MetatypeSchema';
import { CompendiumKey } from '../../importer/Constants';
import { ImportHelper as IH } from '../../helper/ImportHelper';
import { SR5 } from '@/module/config';

export class MetatypeItemParser extends Parser<'metatype'> {
    protected readonly parseType = 'metatype';

    private parseRange(minText?: { _TEXT?: string | number }, maxText?: { _TEXT?: string | number }, augText?: { _TEXT?: string | number }) {
        const min = Number(minText?._TEXT) || 1;
        const max = Number(maxText?._TEXT) || 6;
        const aug_max = Number(augText?._TEXT) || (max + 4);
        return { min, max, aug_max };
    }

    protected override getSystem(jsonData: MetatypeSchemaType) {
        const system = this.getBaseSystem();

        const rawName = (jsonData.name?._TEXT || '').toLowerCase();
        const baseMetatypes = Object.keys(CONFIG.SR5?.metatypes ?? SR5.metatypes);
        const matchedMetatype = baseMetatypes.find(r => rawName.includes(r)) || 'human';

        const rawCat = (jsonData.category?._TEXT || '').toLowerCase();
        let subtype: keyof typeof SR5.metaSubtypes = 'metahuman';
        let subsubtype = '';

        if (rawCat.includes('metasapient')) {
            subtype = 'metasapient';
            const matchedSapient = Object.keys(SR5.metasapientTypes).find(s => rawName.includes(s));
            if (matchedSapient) subsubtype = matchedSapient;
        } else if (rawCat.includes('shapeshifter') || rawName.includes('shapeshifter')) {
            subtype = 'shapeshifter';
            const matchedShifter = Object.keys(SR5.shapeshifterTypes).find(s => rawName.includes(s));
            if (matchedShifter) subsubtype = matchedShifter;
        }

        system.metatype = matchedMetatype;
        system.subtype = subtype;
        system.subsubtype = subsubtype;
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

    protected override async getFolder(jsonData: MetatypeSchemaType, compendiumKey: CompendiumKey): Promise<Folder> {
        const rootFolder = game.i18n.localize('TYPES.Item.metatype');
        const folderName = jsonData.category?._TEXT || 'Metahuman';
        return IH.getFolder(compendiumKey, rootFolder, folderName);
    }
}

export const RaceParser = MetatypeItemParser;
