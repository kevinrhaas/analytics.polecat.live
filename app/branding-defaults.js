/* ============================================================================
   branding-defaults.js — R5+ slice 2 (studio.js module extraction, tech-debt
   track): the "seed a brand-new blank dashboard with our house style" config
   layer — per-field defaults (subtitle/accent/logo/header background/title
   size/subtitle style/dashboard theme/card skin) plus the three named-preset
   collections (style presets, template-variable sets, custom-theme presets)
   built on top of them. Pure localStorage CRUD, no dependency on the live
   editor selection/canvas state — the second ES-module app/*.js extraction
   off studio.js, following the pattern app/chart-thumbnails.js established.

   One piece (the dashboard-theme default) genuinely falls back to the app's
   own live Color theme (LF10) — that lives in studio.js and reads its
   in-memory `S.appTheme`, so it can't move here. Rather than leave THAT one
   pair behind (fracturing the "config layer" into two places), studio.js
   injects the resolver once via configureBrandingDefaults() below; everything
   else here needs zero help from studio.js.

   Loads after model.js (needs Studio.lsGet/Studio.lsSet) and before studio.js
   (app/index.html) — studio.js now does `var defaultSubtitle =
   Studio.defaultSubtitle` etc. where these functions used to live directly.
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  // R3 (tech-debt sweep): stylePresets/templateVarSets/customThemePresets each hand-rolled the
  // same list()/saveList()/delete(id) triplet over lsGet/lsSet, differing only in the storage
  // key — this factory backs all three; each still keeps its own add()/apply() (the fields
  // saved/restored genuinely differ per preset kind).
  function makePresetStore(key) {
    var store = {
      list: function () { return Studio.lsGet(key, []); },
      saveList: function (list) { Studio.lsSet(key, list); },
      remove: function (id) { store.saveList(store.list().filter(function (p) { return p.id !== id; })); }
    };
    return store;
  }

  // Z6/Z5 follow-up: dashboard defaults. A light first cut of the "style-preset collections"
  // ask — a single default subtitle + accent color applied to every brand-new blank dashboard,
  // so a team's house style doesn't need re-entering by hand each time. Existing dashboards
  // (Open/Import/examples) are never touched — this only seeds Studio.emptySpec() output.
  // R3 (tech-debt sweep): these default* getter/setter pairs store a PLAIN string, not JSON
  // (lsGet/lsSet are JSON-shaped and would mis-parse/re-quote what's already saved), so
  // they share this pair of tiny helpers instead — same load/save boilerplate, one place.
  function strDefault(key) {
    var v; try { v = localStorage.getItem(key); } catch (e) {}
    return v || "";
  }
  function setStrDefault(key, v) { try { localStorage.setItem(key, v || ""); } catch (e) {} }
  function defaultSubtitle() { return strDefault("studio-default-subtitle"); }
  function setDefaultSubtitle(v) { setStrDefault("studio-default-subtitle", v); }
  function defaultAccentColor() { return strDefault("studio-default-accent"); }
  function setDefaultAccentColor(v) { setStrDefault("studio-default-accent", v); }
  // Z6 follow-up: default header background color — same seeding pattern as subtitle/accent,
  // for the per-dashboard "Header background color" field (flat banner fill, distinct from
  // Accent color which only tints the border/chart accents).
  function defaultHeaderBg() { return strDefault("studio-default-headerbg"); }
  function setDefaultHeaderBg(v) { setStrDefault("studio-default-headerbg", v); }
  // Z6 follow-up: default title size + subtitle style — same seeding pattern, for the
  // per-dashboard "Title size"/"Subtitle style" fields added after the preset collection shipped.
  function defaultTitleSize() { return strDefault("studio-default-titlesize"); }
  function setDefaultTitleSize(v) { setStrDefault("studio-default-titlesize", v); }
  function defaultSubtitleStyle() { return strDefault("studio-default-subtitlestyle"); }
  function setDefaultSubtitleStyle(v) { setStrDefault("studio-default-subtitlestyle", v); }
  // Visual refresh (A) follow-up: default Dashboard theme — same seeding pattern as the other
  // style defaults, for the whole-look Studio.DASHBOARD_THEMES picker (v281). Lets a team make
  // Fleet Modern (or any future preset) the house look for brand-new dashboards without touching
  // existing ones, without hardcoding a new global default ahead of a user look-see.
  // The "never-set" fallback needs the APP's own live Color theme (LF10), which lives in
  // studio.js as S.appTheme — injected once via configureBrandingDefaults() below instead of
  // duplicating that state here.
  var _resolveAppThemeFallback = function () { return ""; };
  Studio.configureBrandingDefaults = function (resolveAppThemeFallback) {
    _resolveAppThemeFallback = resolveAppThemeFallback;
  };
  function defaultDashboardTheme() {
    var v; try { v = localStorage.getItem("studio-default-dashboardtheme"); } catch (e) {}
    // Never-set → follow the app's own Color theme (LF10), so a brand-new dashboard/widget
    // (and Explore's live preview) reads as one system with the chrome around it instead of
    // always defaulting to Polecat regardless of what Color theme is active. A stored "" is a
    // LEGACY explicit Classic pick (the old Settings select stored classic as empty), and
    // "classic" is the new explicit form — both resolve to "" because a blank key means
    // classic everywhere downstream.
    if (v === null || v === undefined) return _resolveAppThemeFallback();
    return v === "classic" ? "" : v;
  }
  function setDefaultDashboardTheme(v) { setStrDefault("studio-default-dashboardtheme", v); }
  // N-DESIGN follow-up: default card style — same seeding pattern, for the per-dashboard
  // "Card style" (Raised/Flat chart skin) field added right after the picker itself shipped.
  function defaultCardSkin() { return strDefault("studio-default-cardskin"); }
  function setDefaultCardSkin(v) { setStrDefault("studio-default-cardskin", v); }
  // Z6 follow-up: default header logo — the last "still open" item under the style-preset
  // collection ask. Same data-URL-in-localStorage approach as per-dashboard headerLogo/app
  // Branding, just seeded onto brand-new blank dashboards like subtitle/accent already are.
  function defaultLogo() { return strDefault("studio-default-logo"); }
  function setDefaultLogo(v) { setStrDefault("studio-default-logo", v); }
  // Z6 follow-up: named style-preset collection. Each preset snapshots the default
  // fields above under a name, so a team can save several house styles (e.g. per client
  // or per event) and switch the active default with one click instead of re-typing it.
  var _stylePresetStore = makePresetStore("studio-style-presets");
  function stylePresets() { return _stylePresetStore.list(); }
  function saveStylePresetList(list) { _stylePresetStore.saveList(list); }
  function addStylePreset(name) {
    var list = stylePresets();
    list.push({
      id: "sp" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name,
      subtitle: defaultSubtitle(), accentColor: defaultAccentColor(), logo: defaultLogo(), headerBg: defaultHeaderBg(),
      titleSize: defaultTitleSize(), subtitleStyle: defaultSubtitleStyle(), dashboardTheme: defaultDashboardTheme(),
      cardSkin: defaultCardSkin()
    });
    saveStylePresetList(list);
    return list;
  }
  function deleteStylePreset(id) { _stylePresetStore.remove(id); }
  function applyStylePreset(id) {
    var p = stylePresets().filter(function (x) { return x.id === id; })[0];
    if (!p) return false;
    setDefaultSubtitle(p.subtitle || ""); setDefaultAccentColor(p.accentColor || ""); setDefaultLogo(p.logo || ""); setDefaultHeaderBg(p.headerBg || "");
    setDefaultTitleSize(p.titleSize || ""); setDefaultSubtitleStyle(p.subtitleStyle || ""); setDefaultDashboardTheme(p.dashboardTheme || "");
    setDefaultCardSkin(p.cardSkin || "");
    return true;
  }
  // N-DEV follow-up: named, reusable template-variable sets. A style preset (above) seeds new
  // dashboards with default look fields; this instead lets ANY dashboard grab a previously-saved
  // {{key}}→value set in one click — e.g. save an "APAC" set and an "EMEA" set once, then apply
  // whichever fits to any dashboard built from the same {{region}}-templated spec.
  var _templateVarSetStore = makePresetStore("studio-templatevar-sets");
  function templateVarSets() { return _templateVarSetStore.list(); }
  function saveTemplateVarSetList(list) { _templateVarSetStore.saveList(list); }
  function addTemplateVarSet(name, vars) {
    var list = templateVarSets();
    list.push({
      id: "tv" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name,
      vars: (vars || []).map(function (v) { return { key: v.key, value: v.value }; })
    });
    saveTemplateVarSetList(list);
    return list;
  }
  function deleteTemplateVarSet(id) { _templateVarSetStore.remove(id); }
  function applyTemplateVarSet(id, sp) {
    var p = templateVarSets().filter(function (x) { return x.id === id; })[0];
    if (!p) return false;
    sp.templateVars = (p.vars || []).map(function (v) { return { key: v.key, value: v.value }; });
    return true;
  }
  // N-DESIGN follow-up (theme studio, STATUS.md "still open" after the first-cut ship): named,
  // reusable custom-theme presets — same save/apply/delete pattern as stylePresets/
  // templateVarSets above, so an authored custom theme can be saved once and applied to any
  // other dashboard instead of re-picking 8 colors every time.
  var _customThemePresetStore = makePresetStore("studio-customtheme-presets");
  function customThemePresets() { return _customThemePresetStore.list(); }
  function saveCustomThemePresetList(list) { _customThemePresetStore.saveList(list); }
  function addCustomThemePreset(name, customTheme) {
    var list = customThemePresets();
    list.push({
      id: "ct" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name,
      light: { bg: customTheme.light.bg, panel: customTheme.light.panel, text: customTheme.light.text, brand: customTheme.light.brand },
      dark: { bg: customTheme.dark.bg, panel: customTheme.dark.panel, text: customTheme.dark.text, brand: customTheme.dark.brand }
    });
    saveCustomThemePresetList(list);
    return list;
  }
  function deleteCustomThemePreset(id) { _customThemePresetStore.remove(id); }
  function applyCustomThemePreset(id, sp) {
    var p = customThemePresets().filter(function (x) { return x.id === id; })[0];
    if (!p) return false;
    sp.customTheme = {
      light: { bg: p.light.bg, panel: p.light.panel, text: p.light.text, brand: p.light.brand },
      dark: { bg: p.dark.bg, panel: p.dark.panel, text: p.dark.text, brand: p.dark.brand }
    };
    return true;
  }
  function applyDashboardDefaults(spec) {
    var sub = defaultSubtitle(); if (sub && !spec.subtitle) spec.subtitle = sub;
    var acc = defaultAccentColor(); if (acc) spec.themeColor = acc;
    var logo = defaultLogo(); if (logo && !spec.headerLogo) spec.headerLogo = logo;
    var hbg = defaultHeaderBg(); if (hbg && !spec.headerBg) spec.headerBg = hbg;
    var tsz = defaultTitleSize(); if (tsz && !spec.titleSize) spec.titleSize = tsz;
    var sst = defaultSubtitleStyle(); if (sst && !spec.subtitleStyle) spec.subtitleStyle = sst;
    var dth = defaultDashboardTheme(); if (dth && !spec.dashboardTheme) spec.dashboardTheme = dth;
    var csk = defaultCardSkin(); if (csk && !spec.cardSkin) spec.cardSkin = csk;
    return spec;
  }

  Studio.strDefault = strDefault; Studio.setStrDefault = setStrDefault;
  Studio.defaultSubtitle = defaultSubtitle; Studio.setDefaultSubtitle = setDefaultSubtitle;
  Studio.defaultAccentColor = defaultAccentColor; Studio.setDefaultAccentColor = setDefaultAccentColor;
  Studio.defaultHeaderBg = defaultHeaderBg; Studio.setDefaultHeaderBg = setDefaultHeaderBg;
  Studio.defaultTitleSize = defaultTitleSize; Studio.setDefaultTitleSize = setDefaultTitleSize;
  Studio.defaultSubtitleStyle = defaultSubtitleStyle; Studio.setDefaultSubtitleStyle = setDefaultSubtitleStyle;
  Studio.defaultDashboardTheme = defaultDashboardTheme; Studio.setDefaultDashboardTheme = setDefaultDashboardTheme;
  Studio.defaultCardSkin = defaultCardSkin; Studio.setDefaultCardSkin = setDefaultCardSkin;
  Studio.defaultLogo = defaultLogo; Studio.setDefaultLogo = setDefaultLogo;
  Studio.stylePresets = stylePresets; Studio.saveStylePresetList = saveStylePresetList;
  Studio.addStylePreset = addStylePreset; Studio.deleteStylePreset = deleteStylePreset; Studio.applyStylePreset = applyStylePreset;
  Studio.templateVarSets = templateVarSets; Studio.saveTemplateVarSetList = saveTemplateVarSetList;
  Studio.addTemplateVarSet = addTemplateVarSet; Studio.deleteTemplateVarSet = deleteTemplateVarSet; Studio.applyTemplateVarSet = applyTemplateVarSet;
  Studio.customThemePresets = customThemePresets; Studio.saveCustomThemePresetList = saveCustomThemePresetList;
  Studio.addCustomThemePreset = addCustomThemePreset; Studio.deleteCustomThemePreset = deleteCustomThemePreset; Studio.applyCustomThemePreset = applyCustomThemePreset;
  Studio.applyDashboardDefaults = applyDashboardDefaults;
}());
