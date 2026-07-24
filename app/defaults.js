/* ============================================================================
   defaults.js — R5+ slice 3 (studio.js module extraction, tech-debt track):
   the dashboard-defaults config layer (Z6/Z5 follow-up) — the default*
   getter/setter pairs that seed every brand-new blank dashboard (subtitle,
   accent color, header logo/background, title size, subtitle style,
   dashboard theme, card skin), plus the three named-preset collections built
   on top of them (style presets, template-variable sets, custom-theme
   presets) and the applyDashboardDefaults(spec) seeder. Pure localStorage
   config — the one live-state read (dashboardTheme()'s never-set fallback)
   goes through the window.__studioAppTheme test hook studio.js already
   publishes, resolved LAZILY at call time (this module loads first, but by
   the time a caller actually invokes dashboardTheme() studio.js has already
   run and set that hook) — so it extracts cleanly following the
   chart-thumbnails.js/branding.js precedent. Loads before studio.js
   (app/index.html).
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  function lsGet(key, fallback) {
    var v;
    try { v = localStorage.getItem(key); } catch (e) { return fallback; }
    if (v == null) return fallback;
    try { var parsed = JSON.parse(v); return parsed == null ? fallback : parsed; } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota or private-mode */ }
  }
  function makePresetStore(key) {
    var store = {
      list: function () { return lsGet(key, []); },
      saveList: function (list) { lsSet(key, list); },
      remove: function (id) { store.saveList(store.list().filter(function (p) { return p.id !== id; })); }
    };
    return store;
  }

  // these default* getter/setter pairs store a PLAIN string, not JSON (lsGet/lsSet above are
  // JSON-shaped and would mis-parse/re-quote what's already saved), so they share this pair of
  // tiny helpers instead — same load/save boilerplate, one place.
  function strDefault(key) {
    var v; try { v = localStorage.getItem(key); } catch (e) {}
    return v || "";
  }
  function setStrDefault(key, v) { try { localStorage.setItem(key, v || ""); } catch (e) {} }

  function subtitle() { return strDefault("studio-default-subtitle"); }
  function setSubtitle(v) { setStrDefault("studio-default-subtitle", v); }
  function accentColor() { return strDefault("studio-default-accent"); }
  function setAccentColor(v) { setStrDefault("studio-default-accent", v); }
  function headerBg() { return strDefault("studio-default-headerbg"); }
  function setHeaderBg(v) { setStrDefault("studio-default-headerbg", v); }
  function titleSize() { return strDefault("studio-default-titlesize"); }
  function setTitleSize(v) { setStrDefault("studio-default-titlesize", v); }
  function subtitleStyle() { return strDefault("studio-default-subtitlestyle"); }
  function setSubtitleStyle(v) { setStrDefault("studio-default-subtitlestyle", v); }
  function dashboardTheme() {
    var v; try { v = localStorage.getItem("studio-default-dashboardtheme"); } catch (e) {}
    // Never-set → follow the app's own Color theme (LF10), so a brand-new dashboard/widget
    // (and Explore's live preview) reads as one system with the chrome around it instead of
    // always defaulting to Polecat regardless of what Color theme is active. A stored "" is a
    // LEGACY explicit Classic pick (the old Settings select stored classic as empty), and
    // "classic" is the new explicit form — both resolve to "" because a blank key means
    // classic everywhere downstream.
    if (v === null || v === undefined) {
      var at = window.__studioAppTheme;
      return at ? at.toDashboardTheme(at.get()) : "polecat";
    }
    return v === "classic" ? "" : v;
  }
  function setDashboardTheme(v) { setStrDefault("studio-default-dashboardtheme", v); }
  function cardSkin() { return strDefault("studio-default-cardskin"); }
  function setCardSkin(v) { setStrDefault("studio-default-cardskin", v); }
  function logo() { return strDefault("studio-default-logo"); }
  function setLogo(v) { setStrDefault("studio-default-logo", v); }

  // named style-preset collection. Each preset snapshots the default fields above under a
  // name, so a team can save several house styles (e.g. per client or per event) and switch
  // the active default with one click instead of re-typing it.
  var _stylePresetStore = makePresetStore("studio-style-presets");
  function stylePresets() { return _stylePresetStore.list(); }
  function addStylePreset(name) {
    var list = stylePresets();
    list.push({
      id: "sp" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name,
      subtitle: subtitle(), accentColor: accentColor(), logo: logo(), headerBg: headerBg(),
      titleSize: titleSize(), subtitleStyle: subtitleStyle(), dashboardTheme: dashboardTheme(),
      cardSkin: cardSkin()
    });
    _stylePresetStore.saveList(list);
    return list;
  }
  function deleteStylePreset(id) { _stylePresetStore.remove(id); }
  function applyStylePreset(id) {
    var p = stylePresets().filter(function (x) { return x.id === id; })[0];
    if (!p) return false;
    setSubtitle(p.subtitle || ""); setAccentColor(p.accentColor || ""); setLogo(p.logo || ""); setHeaderBg(p.headerBg || "");
    setTitleSize(p.titleSize || ""); setSubtitleStyle(p.subtitleStyle || ""); setDashboardTheme(p.dashboardTheme || "");
    setCardSkin(p.cardSkin || "");
    return true;
  }

  // named, reusable template-variable sets. A style preset (above) seeds new dashboards with
  // default look fields; this instead lets ANY dashboard grab a previously-saved {{key}}→value
  // set in one click — e.g. save an "APAC" set and an "EMEA" set once, then apply whichever
  // fits to any dashboard built from the same {{region}}-templated spec.
  var _templateVarSetStore = makePresetStore("studio-templatevar-sets");
  function templateVarSets() { return _templateVarSetStore.list(); }
  function addTemplateVarSet(name, vars) {
    var list = templateVarSets();
    list.push({
      id: "tv" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name,
      vars: (vars || []).map(function (v) { return { key: v.key, value: v.value }; })
    });
    _templateVarSetStore.saveList(list);
    return list;
  }
  function deleteTemplateVarSet(id) { _templateVarSetStore.remove(id); }
  function applyTemplateVarSet(id, sp) {
    var p = templateVarSets().filter(function (x) { return x.id === id; })[0];
    if (!p) return false;
    sp.templateVars = (p.vars || []).map(function (v) { return { key: v.key, value: v.value }; });
    return true;
  }

  // reusable custom-theme presets — same save/apply/delete pattern as stylePresets/
  // templateVarSets above, so an authored custom theme can be saved once and applied to any
  // other dashboard instead of re-picking 8 colors every time.
  var _customThemePresetStore = makePresetStore("studio-customtheme-presets");
  function customThemePresets() { return _customThemePresetStore.list(); }
  function addCustomThemePreset(name, customTheme) {
    var list = customThemePresets();
    list.push({
      id: "ct" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name,
      light: { bg: customTheme.light.bg, panel: customTheme.light.panel, text: customTheme.light.text, brand: customTheme.light.brand },
      dark: { bg: customTheme.dark.bg, panel: customTheme.dark.panel, text: customTheme.dark.text, brand: customTheme.dark.brand }
    });
    _customThemePresetStore.saveList(list);
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
    var sub = subtitle(); if (sub && !spec.subtitle) spec.subtitle = sub;
    var acc = accentColor(); if (acc) spec.themeColor = acc;
    var lg = logo(); if (lg && !spec.headerLogo) spec.headerLogo = lg;
    var hbg = headerBg(); if (hbg && !spec.headerBg) spec.headerBg = hbg;
    var tsz = titleSize(); if (tsz && !spec.titleSize) spec.titleSize = tsz;
    var sst = subtitleStyle(); if (sst && !spec.subtitleStyle) spec.subtitleStyle = sst;
    var dth = dashboardTheme(); if (dth && !spec.dashboardTheme) spec.dashboardTheme = dth;
    var csk = cardSkin(); if (csk && !spec.cardSkin) spec.cardSkin = csk;
    return spec;
  }

  Studio.Defaults = {
    subtitle: subtitle, setSubtitle: setSubtitle,
    accentColor: accentColor, setAccentColor: setAccentColor,
    headerBg: headerBg, setHeaderBg: setHeaderBg,
    titleSize: titleSize, setTitleSize: setTitleSize,
    subtitleStyle: subtitleStyle, setSubtitleStyle: setSubtitleStyle,
    dashboardTheme: dashboardTheme, setDashboardTheme: setDashboardTheme,
    cardSkin: cardSkin, setCardSkin: setCardSkin,
    logo: logo, setLogo: setLogo,
    stylePresets: stylePresets, addStylePreset: addStylePreset,
    deleteStylePreset: deleteStylePreset, applyStylePreset: applyStylePreset,
    templateVarSets: templateVarSets, addTemplateVarSet: addTemplateVarSet,
    deleteTemplateVarSet: deleteTemplateVarSet, applyTemplateVarSet: applyTemplateVarSet,
    customThemePresets: customThemePresets, addCustomThemePreset: addCustomThemePreset,
    deleteCustomThemePreset: deleteCustomThemePreset, applyCustomThemePreset: applyCustomThemePreset,
    applyDashboardDefaults: applyDashboardDefaults
  };
  // test hooks (unchanged names — pre-extraction call sites/tests read these directly)
  window.__studioStylePresets = stylePresets;
  window.__studioTemplateVarSets = templateVarSets;
  window.__studioCustomThemePresets = customThemePresets;
  window.__studioDefaultSubtitle = subtitle;
  window.__studioDefaultAccentColor = accentColor;
  window.__studioDefaultLogo = logo;
  window.__studioDefaultHeaderBg = headerBg;
  window.__studioDefaultTitleSize = titleSize;
  window.__studioDefaultSubtitleStyle = subtitleStyle;
  window.__studioDefaultDashboardTheme = dashboardTheme;
  window.__studioDefaultCardSkin = cardSkin;
})();
