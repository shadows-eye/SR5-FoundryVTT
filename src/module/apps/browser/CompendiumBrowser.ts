import AppV2 = foundry.applications.api.ApplicationV2;
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CompendiumBrowser extends HandlebarsApplicationMixin(ApplicationV2<any>) {
    /**
     * Default options for the application window.
     */
    static override DEFAULT_OPTIONS = {
        id: "compendium-browser",
        tag: "form",
        position: {
            width: 850,
            height: 700
        },
        window: {
            classes: ["compendium-browser"],
            title: "Compendium Browser",
            minimizable: true,
            resizable: true
        },
    };

    /**
     * Template parts used by the HandlebarsApplicationMixin.
     */
    static override PARTS = {
        content: {
            template: "systems/shadowrun5e/dist/templates/apps/compendium-browser.hbs",
        },
    };

    /**
     * Dynamic title for the application window.
     */
    override get title() {
        return "Compendium Browser";
    }


    override async _prepareContext(options: Parameters<AppV2["_prepareContext"]>[0]) {
        // Start with the base context from the parent class
        const baseContext = await super._prepareContext(options);

        const pack = game.packs.get("world.sr5gear") as CompendiumCollection<'Item'> | undefined;

        if (!pack) return baseContext;

        return {
            ...baseContext,
            entries: Array.from((await pack.getIndex()).values()),
            lastType: null,
        };
    }
}
