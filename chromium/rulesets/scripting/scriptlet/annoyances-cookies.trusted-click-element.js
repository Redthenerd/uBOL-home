/*******************************************************************************

    uBlock Origin Lite - a comprehensive, MV3-compliant content blocker
    Copyright (C) 2014-present Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock

*/

// ruleset: annoyances-cookies

// Important!
// Isolate from global scope

// Start of local scope
(function uBOL_trustedClickElement() {

/******************************************************************************/

function trustedClickElement(
    selectors = '',
    extraMatch = '',
    delay = ''
) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('trusted-click-element', selectors, extraMatch, delay);

    if ( extraMatch !== '' ) {
        const assertions = safe.String_split.call(extraMatch, ',').map(s => {
            const pos1 = s.indexOf(':');
            const s1 = pos1 !== -1 ? s.slice(0, pos1) : s;
            const not = s1.startsWith('!');
            const type = not ? s1.slice(1) : s1;
            const s2 = pos1 !== -1 ? s.slice(pos1+1).trim() : '';
            if ( s2 === '' ) { return; }
            const out = { not, type };
            const match = /^\/(.+)\/(i?)$/.exec(s2);
            if ( match !== null ) {
                out.re = new RegExp(match[1], match[2] || undefined);
                return out;
            }
            const pos2 = s2.indexOf('=');
            const key = pos2 !== -1 ? s2.slice(0, pos2).trim() : s2;
            const value = pos2 !== -1 ? s2.slice(pos2+1).trim() : '';
            out.re = new RegExp(`^${this.escapeRegexChars(key)}=${this.escapeRegexChars(value)}`);
            return out;
        }).filter(details => details !== undefined);
        const allCookies = assertions.some(o => o.type === 'cookie')
            ? getAllCookiesFn()
            : [];
        const allStorageItems = assertions.some(o => o.type === 'localStorage')
            ? getAllLocalStorageFn()
            : [];
        const hasNeedle = (haystack, needle) => {
            for ( const { key, value } of haystack ) {
                if ( needle.test(`${key}=${value}`) ) { return true; }
            }
            return false;
        };
        for ( const { not, type, re } of assertions ) {
            switch ( type ) {
            case 'cookie':
                if ( hasNeedle(allCookies, re) === not ) { return; }
                break;
            case 'localStorage':
                if ( hasNeedle(allStorageItems, re) === not ) { return; }
                break;
            }
        }
    }

    const getShadowRoot = elem => {
        // Firefox
        if ( elem.openOrClosedShadowRoot ) {
            return elem.openOrClosedShadowRoot;
        }
        // Chromium
        if ( typeof chrome === 'object' ) {
            if ( chrome.dom && chrome.dom.openOrClosedShadowRoot ) {
                return chrome.dom.openOrClosedShadowRoot(elem);
            }
        }
        return null;
    };

    const querySelectorEx = (selector, context = document) => {
        const pos = selector.indexOf(' >>> ');
        if ( pos === -1 ) { return context.querySelector(selector); }
        const outside = selector.slice(0, pos).trim();
        const inside = selector.slice(pos + 5).trim();
        const elem = context.querySelector(outside);
        if ( elem === null ) { return null; }
        const shadowRoot = getShadowRoot(elem);
        return shadowRoot && querySelectorEx(inside, shadowRoot);
    };

    const selectorList = safe.String_split.call(selectors, /\s*,\s*/)
        .filter(s => {
            try {
                void querySelectorEx(s);
            } catch {
                return false;
            }
            return true;
        });
    if ( selectorList.length === 0 ) { return; }

    const clickDelay = parseInt(delay, 10) || 1;
    const t0 = Date.now();
    const tbye = t0 + 10000;
    let tnext = selectorList.length !== 1 ? t0 : t0 + clickDelay;

    const terminate = ( ) => {
        selectorList.length = 0;
        next.stop();
        observe.stop();
    };

    const next = notFound => {
        if ( selectorList.length === 0 ) {
            safe.uboLog(logPrefix, 'Completed');
            return terminate();
        }
        const tnow = Date.now();
        if ( tnow >= tbye ) {
            safe.uboLog(logPrefix, 'Timed out');
            return terminate();
        }
        if ( notFound ) { observe(); }
        const delay = Math.max(notFound ? tbye - tnow : tnext - tnow, 1);
        next.timer = setTimeout(( ) => {
            next.timer = undefined;
            process();
        }, delay);
        safe.uboLog(logPrefix, `Waiting for ${selectorList[0]}...`);
    };
    next.stop = ( ) => {
        if ( next.timer === undefined ) { return; }
        clearTimeout(next.timer);
        next.timer = undefined;
    };

    const observe = ( ) => {
        if ( observe.observer !== undefined ) { return; }
        observe.observer = new MutationObserver(( ) => {
            if ( observe.timer !== undefined ) { return; }
            observe.timer = setTimeout(( ) => {
                observe.timer = undefined;
                process();
            }, 20);
        });
        observe.observer.observe(document, {
            attributes: true,
            childList: true,
            subtree: true,
        });
    };
    observe.stop = ( ) => {
        if ( observe.timer !== undefined ) {
            clearTimeout(observe.timer);
            observe.timer = undefined;
        }
        if ( observe.observer ) {
            observe.observer.disconnect();
            observe.observer = undefined;
        }
    };

    const process = ( ) => {
        next.stop();
        if ( Date.now() < tnext ) { return next(); }
        const selector = selectorList.shift();
        if ( selector === undefined ) { return terminate(); }
        const elem = querySelectorEx(selector);
        if ( elem === null ) {
            selectorList.unshift(selector);
            return next(true);
        }
        safe.uboLog(logPrefix, `Clicked ${selector}`);
        elem.click();
        tnext += clickDelay;
        next();
    };

    runAtHtmlElementFn(process);
}

function getAllCookiesFn() {
    const safe = safeSelf();
    return safe.String_split.call(document.cookie, /\s*;\s*/).map(s => {
        const pos = s.indexOf('=');
        if ( pos === 0 ) { return; }
        if ( pos === -1 ) { return `${s.trim()}=`; }
        const key = s.slice(0, pos).trim();
        const value = s.slice(pos+1).trim();
        return { key, value };
    }).filter(s => s !== undefined);
}

function getAllLocalStorageFn(which = 'localStorage') {
    const storage = self[which];
    const out = [];
    for ( let i = 0; i < storage.length; i++ ) {
        const key = storage.key(i);
        const value = storage.getItem(key);
        return { key, value };
    }
    return out;
}

function runAtHtmlElementFn(fn) {
    if ( document.documentElement ) {
        fn();
        return;
    }
    const observer = new MutationObserver(( ) => {
        observer.disconnect();
        fn();
    });
    observer.observe(document, { childList: true });
}

function safeSelf() {
    if ( scriptletGlobals.safeSelf ) {
        return scriptletGlobals.safeSelf;
    }
    const self = globalThis;
    const safe = {
        'Array_from': Array.from,
        'Error': self.Error,
        'Function_toStringFn': self.Function.prototype.toString,
        'Function_toString': thisArg => safe.Function_toStringFn.call(thisArg),
        'Math_floor': Math.floor,
        'Math_max': Math.max,
        'Math_min': Math.min,
        'Math_random': Math.random,
        'Object': Object,
        'Object_defineProperty': Object.defineProperty.bind(Object),
        'Object_defineProperties': Object.defineProperties.bind(Object),
        'Object_fromEntries': Object.fromEntries.bind(Object),
        'Object_getOwnPropertyDescriptor': Object.getOwnPropertyDescriptor.bind(Object),
        'Object_hasOwn': Object.hasOwn.bind(Object),
        'RegExp': self.RegExp,
        'RegExp_test': self.RegExp.prototype.test,
        'RegExp_exec': self.RegExp.prototype.exec,
        'Request_clone': self.Request.prototype.clone,
        'String': self.String,
        'String_fromCharCode': String.fromCharCode,
        'String_split': String.prototype.split,
        'XMLHttpRequest': self.XMLHttpRequest,
        'addEventListener': self.EventTarget.prototype.addEventListener,
        'removeEventListener': self.EventTarget.prototype.removeEventListener,
        'fetch': self.fetch,
        'JSON': self.JSON,
        'JSON_parseFn': self.JSON.parse,
        'JSON_stringifyFn': self.JSON.stringify,
        'JSON_parse': (...args) => safe.JSON_parseFn.call(safe.JSON, ...args),
        'JSON_stringify': (...args) => safe.JSON_stringifyFn.call(safe.JSON, ...args),
        'log': console.log.bind(console),
        // Properties
        logLevel: 0,
        // Methods
        makeLogPrefix(...args) {
            return this.sendToLogger && `[${args.join(' \u205D ')}]` || '';
        },
        uboLog(...args) {
            if ( this.sendToLogger === undefined ) { return; }
            if ( args === undefined || args[0] === '' ) { return; }
            return this.sendToLogger('info', ...args);
            
        },
        uboErr(...args) {
            if ( this.sendToLogger === undefined ) { return; }
            if ( args === undefined || args[0] === '' ) { return; }
            return this.sendToLogger('error', ...args);
        },
        escapeRegexChars(s) {
            return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        },
        initPattern(pattern, options = {}) {
            if ( pattern === '' ) {
                return { matchAll: true, expect: true };
            }
            const expect = (options.canNegate !== true || pattern.startsWith('!') === false);
            if ( expect === false ) {
                pattern = pattern.slice(1);
            }
            const match = /^\/(.+)\/([gimsu]*)$/.exec(pattern);
            if ( match !== null ) {
                return {
                    re: new this.RegExp(
                        match[1],
                        match[2] || options.flags
                    ),
                    expect,
                };
            }
            if ( options.flags !== undefined ) {
                return {
                    re: new this.RegExp(this.escapeRegexChars(pattern),
                        options.flags
                    ),
                    expect,
                };
            }
            return { pattern, expect };
        },
        testPattern(details, haystack) {
            if ( details.matchAll ) { return true; }
            if ( details.re ) {
                return this.RegExp_test.call(details.re, haystack) === details.expect;
            }
            return haystack.includes(details.pattern) === details.expect;
        },
        patternToRegex(pattern, flags = undefined, verbatim = false) {
            if ( pattern === '' ) { return /^/; }
            const match = /^\/(.+)\/([gimsu]*)$/.exec(pattern);
            if ( match === null ) {
                const reStr = this.escapeRegexChars(pattern);
                return new RegExp(verbatim ? `^${reStr}$` : reStr, flags);
            }
            try {
                return new RegExp(match[1], match[2] || undefined);
            }
            catch {
            }
            return /^/;
        },
        getExtraArgs(args, offset = 0) {
            const entries = args.slice(offset).reduce((out, v, i, a) => {
                if ( (i & 1) === 0 ) {
                    const rawValue = a[i+1];
                    const value = /^\d+$/.test(rawValue)
                        ? parseInt(rawValue, 10)
                        : rawValue;
                    out.push([ a[i], value ]);
                }
                return out;
            }, []);
            return this.Object_fromEntries(entries);
        },
        onIdle(fn, options) {
            if ( self.requestIdleCallback ) {
                return self.requestIdleCallback(fn, options);
            }
            return self.requestAnimationFrame(fn);
        },
        offIdle(id) {
            if ( self.requestIdleCallback ) {
                return self.cancelIdleCallback(id);
            }
            return self.cancelAnimationFrame(id);
        }
    };
    scriptletGlobals.safeSelf = safe;
    if ( scriptletGlobals.bcSecret === undefined ) { return safe; }
    // This is executed only when the logger is opened
    safe.logLevel = scriptletGlobals.logLevel || 1;
    let lastLogType = '';
    let lastLogText = '';
    let lastLogTime = 0;
    safe.toLogText = (type, ...args) => {
        if ( args.length === 0 ) { return; }
        const text = `[${document.location.hostname || document.location.href}]${args.join(' ')}`;
        if ( text === lastLogText && type === lastLogType ) {
            if ( (Date.now() - lastLogTime) < 5000 ) { return; }
        }
        lastLogType = type;
        lastLogText = text;
        lastLogTime = Date.now();
        return text;
    };
    try {
        const bc = new self.BroadcastChannel(scriptletGlobals.bcSecret);
        let bcBuffer = [];
        safe.sendToLogger = (type, ...args) => {
            const text = safe.toLogText(type, ...args);
            if ( text === undefined ) { return; }
            if ( bcBuffer === undefined ) {
                return bc.postMessage({ what: 'messageToLogger', type, text });
            }
            bcBuffer.push({ type, text });
        };
        bc.onmessage = ev => {
            const msg = ev.data;
            switch ( msg ) {
            case 'iamready!':
                if ( bcBuffer === undefined ) { break; }
                bcBuffer.forEach(({ type, text }) =>
                    bc.postMessage({ what: 'messageToLogger', type, text })
                );
                bcBuffer = undefined;
                break;
            case 'setScriptletLogLevelToOne':
                safe.logLevel = 1;
                break;
            case 'setScriptletLogLevelToTwo':
                safe.logLevel = 2;
                break;
            }
        };
        bc.postMessage('areyouready?');
    } catch {
        safe.sendToLogger = (type, ...args) => {
            const text = safe.toLogText(type, ...args);
            if ( text === undefined ) { return; }
            safe.log(`uBO ${text}`);
        };
    }
    return safe;
}

/******************************************************************************/

const scriptletGlobals = {}; // eslint-disable-line
const argsList = [["button#W0wltc","","500"],["form[action] button[jsname=\"tWT92d\"]"],["[action=\"https://consent.youtube.com/save\"][style=\"display:inline;\"] [name=\"set_eom\"][value=\"true\"] ~ .basebuttonUIModernization[value][aria-label]"],["[role=\"dialog\"]:has([href=\"https://www.facebook.com/policies/cookies/\"]) [aria-hidden=\"true\"] + [aria-label][tabindex=\"0\"]","","1000"],["button._a9_1","","1000"],["[title=\"Manage Cookies\"]"],["[title=\"Reject All\"]","","1000"],["button.sp_choice_type_11"],["button[aria-label=\"Accept All\"]","","1000"],["button#cmp-consent-button","","2500"],[".sp_choice_type_12[title=\"Options\"]"],["[title=\"REJECT ALL\"]","","500"],[".sp_choice_type_12[title=\"OPTIONS\"]"],["[title=\"Reject All\"]","","500"],["button[title=\"READ FOR FREE\"]","","1000"],[".terms-conditions button.transfer__button"],[".fides-consent-wall .fides-banner-button-group > button.fides-reject-all-button"],["button[title^=\"Consent\"]"],["button[title^=\"Einwilligen\"]"],["button.fides-reject-all-button","","500"],["button.reject-all"],[".cmp__dialog-footer-buttons > .is-secondary"],["button[onclick=\"IMOK()\"]","","500"],["a.btn--primary"],[".message-container.global-font button.message-button.no-children.focusable.button-font.sp_choice_type_12[title=\"MORE OPTIONS\""],["[data-choice=\"1683026410215\"]","","500"],["button[aria-label=\"close button\"]","","1000"],["button[class=\"w_eEg0 w_OoNT w_w8Y1\"]","","1000"],["#usercentrics-root >>> button[data-testid=\"uc-deny-all-button\"]"],["button.sp_choice_type_12[title$=\"Settings\"]","","800"],["button[title=\"REJECT ALL\"]","","1200"],["button.iubenda-cs-customize-btn, button.iub-cmp-reject-btn, button#iubFooterBtn","","1000"],[".accept[onclick=\"cmpConsentWall.acceptAllCookies()\"]","","1000"],[".sp_choice_type_12[title=\"Manage Cookies\"]"],[".sp_choice_type_REJECT_ALL","","500"],["button[title=\"Accept Cookies\"]","","1000"],["a.cc-dismiss","","1000"],["button[data-test=\"pwa-consent-layer-save-settings\"]","","1000"],["button.denyAll","","1000"],["button[data-tracking-name=\"cookie-preferences-mloi-initial-opt-out\"]"],["button[kind=\"secondary\"][data-test=\"cookie-necessary-button\"]","","1000"],["button[data-cookiebanner=\"accept_only_essential_button\"]","","1000"],["button.cassie-reject-all","","1000"],["button[title=\"I do not agree\"]"],["#qc-cmp2-container button#disagree-btn"],["button.alma-cmp-button[title=\"Hyväksy\"]"],[".sanoma-logo-container ~ .message-component.sticky-buttons button.sp_choice_type_12[title=\"Asetukset\"]"],[".sanoma-logo-container ~ .message-component.privacy-manager-tcfv2 .tcfv2-stack[title=\"Sanoman sisällönjakelukumppanit\"] button.pm-switch[aria-checked=\"false\"]"],[".sanoma-logo-container ~ .message-component button.sp_choice_type_SAVE_AND_EXIT[title=\"Tallenna\"]","","1500"],["button[id=\"rejectAll\"]","","1000"],["#onetrust-accept-btn-handler","","1000"],["button[title=\"Accept and continue\"]"],["button[title=\"Accept All Cookies\"]"],[".accept-all"],["#CybotCookiebotDialogBodyButtonAccept"],["[data-paywall-notifier=\"consent-agreetoall\"]","","1000"],["ytd-button-renderer.ytd-consent-bump-v2-lightbox + ytd-button-renderer.ytd-consent-bump-v2-lightbox button[style][aria-label][title]","","1000"],["kpcf-cookie-toestemming >>> button[class=\"ohgs-button-primary-green\"]","","1000"],[".privacy-cp-wall #privacy-cp-wall-accept"],["button[aria-label=\"Continua senza accettare\"]"],["label[class=\"input-choice__label\"][for=\"CookiePurposes_1_\"], label[class=\"input-choice__label\"][for=\"CookiePurposes_2_\"], button.js-save[type=\"submit\"]"],["[aria-label=\"REJECT ALL\"]","","500"],["[href=\"/x-set-cookie/\"]"],["#dialogButton1"],["#overlay > div > #banner:has([href*=\"privacyprefs/\"]) music-button:last-of-type"],[".call"],["#cl-consent button[data-role=\"b_decline\"]"],["#privacy-cp-wall-accept"],["button.js-cookie-accept-all","","2000"],["button[data-label=\"accept-button\"]","","1000"],[".cmp-scroll-padding .cmp-info[style] #cmp-paywall #cmp-consent #cmp-btn-accept","","2000"],["button#pt-accept-all"],["[for=\"checkbox_niezbedne\"], [for=\"checkbox_spolecznosciowe\"], .btn-primary"],["[aria-labelledby=\"banner-title\"] > div[class^=\"buttons_\"] > button[class*=\"secondaryButton_\"] + button"],["#cmpwrapper >>> #cmpbntyestxt","","1000"],["#cmpwrapper >>> .cmptxt_btn_no","","1000"],["#cmpwrapper >>> .cmptxt_btn_save","","1000"],[".iubenda-cs-customize-btn, #iubFooterBtn"],[".privacy-popup > div > button","","2000"],["#pubtech-cmp #pt-close"],[".didomi-continue-without-agreeing","","1000"],["#ccAcceptOnlyFunctional","","4000"],["button.optoutmulti_button","","2000"],["button[title=\"Accepter\"]"],["button[title=\"Godta alle\"]","","1000"],[".btns-container > button[title=\"Tilpass cookies\"]"],[".message-row > button[title=\"Avvis alle\"]","","2000"],["button.glue-cookie-notification-bar__reject","","1000"],["button[data-gdpr-expression=\"acceptAll\"]"],["span.as-oil__close-banner"],["button[data-cy=\"cookie-banner-necessary\"]"],["h2 ~ div[class^=\"_\"] > div[class^=\"_\"] > a[rel=\"noopener noreferrer\"][target=\"_self\"][class^=\"_\"]:only-child"],[".cky-btn-accept"],["button[aria-label=\"Agree\"]"],["button[onclick=\"Didomi.setUserAgreeToAll();\"]","","1800"],["button[title^=\"Alle akzeptieren\" i]","","1000"],["button[aria-label=\"Alle akzeptieren\"]"],["button[data-label=\"Weigeren\"]","","500"],["button.decline-all","","1000"],["button.cookie-decline-all","","1800"],["button[aria-label=\"I Accept\"]","","1000"],[".button--necessary-approve","","2000"],[".button--necessary-approve","","4000"],["button.agree-btn","","2000"],[".ReactModal__Overlay button[class*=\"terms-modal_done__\"]"],["button.cookie-consent__accept-button","","2000"],["button[id=\"ue-accept-notice-button\"]","","2000"],["#usercentrics-root >>> button[data-testid=\"uc-deny-all-button\"]","","1000"],["#usercentrics-root >>> button[data-testid=\"uc-accept-all-button\"]","","1000"],["[data-testid=\"cookie-policy-banner-accept\"]","","500"],["button.accept-all","1000"],[".szn-cmp-dialog-container >>> button[data-testid=\"cw-button-agree-with-ads\"]","","2000"],["button[action-name=\"agreeAll\"]","","1000"],[".as-oil__close-banner","","1000"],["button[title=\"Einverstanden\"]","","1000"],["button.iubenda-cs-accept-btn","","1000"],["button.iubenda-cs-close-btn"],["button[title=\"Aceitar todos\"]","","1000"],["button.cta-button[title=\"Tümünü reddet\"]"],["button[title=\"Akzeptieren und weiter\"]","","1000"],[".qc-cmp2-summary-buttons > button[mode=\"secondary\"]"],["[class^=\"qc-cmp2-buttons\"] > [data-tmdatatrack=\"privacy-other-save\"]","","1000"],["button[mode=\"primary\"][data-tmdatatrack=\"privacy-cookie\"]","","1000"],["button[class*=\"cipa-accept-btn\"]","","1000"],["a[href=\"javascript:Didomi.setUserAgreeToAll();\"]","","1000"],["#didomi-notice-agree-button","","1000"],["#didomi-notice-agree-button"],["button#cookie-onetrust-show-info","","900"],[".save-preference-btn-handler","","1100"],["button[data-testid=\"granular-banner-button-decline-all\"]","","1000"],["button[aria-label*=\"Aceptar\"]","","1000"],["button[title*=\"Accept\"]","","1000"],["button[title*=\"AGREE\"]","","1000"],["button[title=\"Alles akzeptieren\"]","","1000"],["button[title=\"Godkänn alla cookies\"]","","1000"],["button[title=\"ALLE AKZEPTIEREN\"]","","1000"],["button[title=\"Reject all\"]","","1000"],["button[title=\"I Agree\"]","","1000"],["button[title=\"AKZEPTIEREN UND WEITER\"]","","1000"],["button[title=\"Hyväksy kaikki\"]","","1000"],["button[title=\"TILLAD NØDVENDIGE\"]","","1000"],["button[title=\"Accept All & Close\"]","","1000"],["#CybotCookiebotDialogBodyButtonDecline","","1000"],["div.decline","","1000"],["button#declineAllConsentSummary","","1500"],["button.deny-btn","","1000"],["span#idxrcookiesKO","","1000"],["button[data-action=\"cookie-consent#onToggleShowManager\"]","","900"],["button[data-action=\"cookie-consent#onSaveSetting\"]","","1200"],["button#consent_wall_optin"],["span#cmpbntyestxt","","1000"],["button[title=\"Akzeptieren\"]","","1000"],["button#btn-gdpr-accept","","1500"],["a[href][onclick=\"ov.cmp.acceptAllConsents()\"]","","1000"],["button.fc-primary-button","","1000"],["button[data-id=\"save-all-pur\"]","","1000"],["button.button__acceptAll","","1000"],["button.button__skip"],["button.accept-button"],["custom-button[id=\"consentAccept\"]","","1000"],["button[mode=\"primary\"]"],["a.cmptxt_btn_no","","1000"],["button[data-test=\"pwa-consent-layer-save-settings\"]","","1000]"],["[target=\"_self\"][type=\"button\"][class=\"_3kalix4\"]","","1000"],["button[type=\"button\"][class=\"_button_15feu_3\"]","","1000"],["[target=\"_self\"][type=\"button\"][class=\"_10qqh8uq\"]","","1000"],["button[data-reject-all]","","1000"],["button[title=\"Einwilligen und weiter\"]","","1000"],["button[title=\"Dismiss\"]"],["button.refuseAll","","1000"],["button[data-cc-action=\"accept\"]","","1000"],["button[id=\"teal-consent-prompt-submit\"]","","1000"],["button[id=\"consent_prompt_submit\"]","","1000"],["button[name=\"accept\"]","","1000"],["button[id=\"consent_prompt_decline\"]","","1000"],["button[data-tpl-type=\"Button\"]","","1000"],["button[data-tracking-name=\"cookie-preferences-sloo-opt-out\"]","","1000"],["button[title=\"ACCEPT\"]"],["button[title=\"SAVE AND EXIT\"]"],["button[aria-label=\"Reject All\"]","","1000"],["button[id=\"explicit-consent-prompt-reject\"]","","1000"],["button[data-purpose=\"cookieBar.button.accept\"]","","1000"],["button[data-testid=\"uc-button-accept-and-close\"]","","1000"],["[data-testid=\"submit-login-button\"].decline-consent","","1000"],["button[type=\"submit\"].btn-deny","","1000"],["a.cmptxt_btn_yes"],["button[data-action=\"adverts#accept\"]","","1000"],[".cmp-accept","","2500"],[".cmp-accept","","3500"],["[data-testid=\"consent-necessary\"]"],["button[id=\"onetrust-reject-all-handler\"]","","1500"],["button.onetrust-close-btn-handler","","1000"],["div[class=\"t_cm_ec_reject_button\"]","","1000"],["button[aria-label=\"نعم انا موافق\"]"],["button[title=\"Agree\"]","","1000"],["a.cookie-permission--accept-button","","1600"],["button[title=\"Alle ablehnen\"]","","1800"],["button.pixelmate-general-deny","","1000"],["a.mmcm-btn-decline","","1000"],["button.hi-cookie-btn-accept-necessary","","1000"],["button[data-testid=\"buttonCookiesAccept\"]","","1500"],["a[fs-consent-element=\"deny\"]","","1000"],["a#cookies-consent-essential","","1000"],["a.hi-cookie-continue-without-accepting","","1500"],["button[aria-label=\"Close\"]","","1000"],["button.sc-9a9fe76b-0.jgpQHZ","","1000"],["button[data-e2e=\"pure-accept-ads\"]","","1000"],["button[data-auto-id=\"glass-gdpr-default-consent-reject-button\"]","","1000"],["button[aria-label=\"Prijať všetko\"]"],["a.cc-btn.cc-allow","","1000"],[".qc-cmp2-summary-buttons > button[mode=\"primary\"]","","2000"],["button[class*=\"cipa-accept-btn\"]","","2000"],["button[data-js=\"cookieConsentReject\"]","","1000"],["button[title*=\"Jetzt zustimmen\"]","","1600"],["a[id=\"consent_prompt_decline\"]","","1000"],["button[id=\"cm-acceptNone\"]","","1000"],["button.brlbs-btn-accept-only-essential","","1000"],["button[id=\"didomi-notice-disagree-button\"]","","1000"],["a[href=\"javascript:Didomi.setUserDisagreeToAll()\"]","","1000"],["button[onclick=\"Didomi.setUserDisagreeToAll();\"]","","1000"],["a#cookie-accept","","1000"],["button.decline-button","","1000"],["button.inv-cmp-button.inv-font-btn","","1800"],["button.cookie-notice__button--dismiss","","1000"],["button[data-testid=\"cookies-politics-reject-button--button\"]","","1000"],["cds-button[id=\"cookie-allow-necessary-et\"]","","1000"],["button[title*=\"Zustimmen\" i]","","1000"],["button[title=\"Ich bin einverstanden\"]","","","1000"],["button[id=\"userSelectAll\"]","","1000"],["button[title=\"Consent and continue\"]","","1000"],["button[title=\"Accept all\"i]","","1000"],["button[title=\"Save & Exit\"]","","1000"],["button[title=\"Akzeptieren & Schließen\"]","","1000"],["button[title=\"Schließen & Akzeptieren\"]","","1000"],["button.button-reject","","1000"],["button[data-cookiefirst-action=\"accept\"]","","1000"],["button[data-cookiefirst-action=\"reject\"]","","1000"],["button.mde-consent-accept-btn","","2600"],[".gdpr-modal .gdpr-btn--secondary, .gdpr-modal .gdpr-modal__box-bottom-dx > button.gdpr-btn--br:first-child"],["button#consent_prompt_decline","","1000"],["button[id=\"save-all-pur\"]","","1000"],["button[id=\"save-all-conditionally\"]","","1000"],["a[onclick=\"AcceptAllCookies(true); \"]","","1000"],["button[title=\"Akzeptieren & Weiter\"]","","1000"],["button#ensRejectAll","","1500"],["a.js-cookie-popup","","650"],["button.button_default","","800"],["button.CybotCookiebotDialogBodyButton","","1000"],["a#CybotCookiebotDialogBodyButtonAcceptAll","","1000"],["button[title=\"Kun nødvendige\"]","","2500"],["button[title=\"Accept\"]","","1000"],["button[onclick=\"CookieInformation.declineAllCategories()\"]","","1000"],["button.js-decline-all-cookies","","1500"],["button.cookieselection-confirm-selection","","1000"],["button#btn-reject-all","","1000"],["button[data-consent-trigger=\"1\"]","","1000"],["button#cookiebotDialogOkButton","","1000"],["button.reject-btn","","1000"],["button.accept-btn","","1000"],["button.js-deny","","1500"],["a.jliqhtlu__close","","1000"],["a.cookie-consent--reject-button","","1000"],["button[title=\"Alle Cookies akzeptieren\"]","","1000"],["button[data-test-id=\"customer-necessary-consents-button\"]","","1000"],["button.ui-cookie-consent__decline-button","","1000"],["button.cookies-modal-warning-reject-button","","1000"],["button[data-type=\"nothing\"]","","1000"],["button.cm-btn-accept","","1000"],["button[data-dismiss=\"modal\"]","","1000"],["button#js-agree-cookies-button","","1000"],["button[data-testid=\"cookie-popup-reject\"]","","1000"],["button#truste-consent-required","","1000"],["button[data-testid=\"button-core-component-Avslå\"]","","1000"],["epaas-consent-drawer-shell >>> button.reject-button","","1000"],["button.ot-bnr-save-handler","","1000"],["button#button-accept-necessary","","1500"],["button[data-cookie-layer-accept=\"selected\"]","","1000"],[".open > ng-transclude > footer > button.accept-selected-btn","","1000"],[".open_modal .modal-dialog .modal-content form .modal-header button[name=\"refuse_all\"]","","1000"],["div.button_cookies[onclick=\"RefuseCookie()\"]"],["button[onclick=\"SelectNone()\"]","","1000"],["button[data-tracking-element-id=\"cookie_banner_essential_only\"]","","1600"],["button[name=\"decline_cookie\"]","","1000"],["button[id=\"ketch-banner-button-secondary\"]","","1000"],["button.cmpt_customer--cookie--banner--continue","","1000"],["button.cookiesgdpr__rejectbtn","","1000"],["button[onclick=\"confirmAll('theme-showcase')\"]","","1000"],["button.oax-cookie-consent-select-necessary","","1000"],["button#cookieModuleRejectAll","","1000"],["button.js-cookie-accept-all","","1000"],["label[for=\"ok\"]","","500"],["button.payok__submit","","750"],["button.btn-outline-secondary","","1000"],["button#footer_tc_privacy_button_2","","1000"],["input[name=\"pill-toggle-external-media\"]","","500"],["button.p-layer__button--selection","","750"],["button[data-analytics-cms-event-name=\"cookies.button.alleen-noodzakelijk\"]","","2600"],["button[aria-label=\"Vypnúť personalizáciu\"]","","1000"],[".cookie-text > .large-btn","","1000"],["button#zenEPrivacy_acceptAllBtn","","1000"],["button[title=\"OK\"]","","1000"],[".l-cookies-notice .btn-wrapper button[data-name=\"accept-all-cookies\"]","","1000"],["button.btn-accept-necessary","","1000"],["button#popin_tc_privacy_button","","1000"],["button#cb-RejectAll","","1000"],["button#DenyAll","","1000"],["button.gdpr-btn.gdpr-btn-white","","1000"],["button[name=\"decline-all\"]","","1000"],["button#saveCookieSelection","","1000"],["input.cookieacceptall","","1000"],["button[data-role=\"necessary\"]","","1000"],["input[value=\"Acceptér valgte\"]","","1000"],["button[aria-label=\"Accepter kun de nødvendige cookies\"]","","1000"],["cookie-consent-element >>> button[aria-label=\"Accepter kun de nødvendige cookies\"]","","1000"],[".dmc-accept-all","","1000"],["button#hs-eu-decline-button","","1000"],["button[onclick=\"wsSetAcceptedCookies(this);\"]","","1000"],["button[data-tid=\"banner-accept\"]","","1000"],["div#cookiescript_accept","","1000"],["button#popin-cookies-btn-refuse","","1000"],["button.AP_mdf-accept","","1500"],["button#cm-btnRejectAll","","1000"],["button[data-cy=\"iUnderstand\"]","","1000"],["button[data-cookiebanner=\"accept_button\"]","","1000"],["button.cky-btn-reject","","1000"],["button#reject-all-gdpr","","1000"],["button#consentDisagreeButton","","1000"],[".logoContainer > .modalBtnAccept","","1000"],["button.js-cookie-banner-decline-all","","1000"],["button.cmplz-deny","","1000"],["button[aria-label=\"Reject all\"]","","1000"],["button[title=\"Aceptar y continuar\"]","","1000"],["button[title=\"Accettare e continuare\"]","","1000"],["button[title=\"Concordar\"]","","1000"],["button[title=\"Accepter et continuer\"]","","1500"],["div#consent_prompt_decline_submit","","1000"],["button.js-acceptNecessaryCookies","","1000"],[".show.modal .modal-dialog .modal-content .modal-footer a.s-cookie-transparency__link-reject-all","","1000"],["button#UCButtonSettings","500"],["button#CybotCookiebotDialogBodyLevelButtonAccept","750"],["button[name=\"rejectAll\"]","","1000"],["button.env-button--primary","","1000"],["div#consent_prompt_reject","","1000"],["button#js-ssmp-clrButtonLabel","","1000"],[".modal.in .modal-dialog .modal-content .modal-footer button#saveGDPR","","2000"],["button#btnAcceptAllCookies","","1000"],["button[class=\"amgdprcookie-button -decline\"]","","3000"],["button[data-t=\"continueWithoutAccepting\"]","","1000"],["button.si-cookie-notice__button--reject","","1000"],["button.cookieselection-confirm-necessary","","2500"],["button[value=\"essential\"]","","1000"],["button.btn--white.l-border.cookie-notice__btn","","1000"],["a#bstCookieAlertBtnNecessary","","1000"],["button.save.btn-form.btn-inverted","","1000"],["button.manage-cookies","","500"],["button.save.primary-button","","750"],["button.ch2-deny-all-btn","","1500"],["button[data-testid=\"cookie-modal-actions-decline\"]","","1000"],["span.cookies_rechazo","","1000"],["button.ui-button-secondary.ui-button-secondary-wide","","500"],["button.ui-button-primary-wide.ui-button-text-only","","750"],["button#shopify-pc__banner__btn-decline","","1000"],["button.consent-info-cta.more","","500"],["button.consent-console-save.ko","","750"],["button[data-testid=\"reject-all-cookies-button\"]","","1000"],["button#show-settings-button","","500"],["button#save-settings-button","","750"],["button[title=\"Jag godkänner\"]","","1000"],["label[title=\"Externe Medien\"]","","1000"],["button.save-cookie-settings","","1200"],["button#gdpr-btn-refuse-all","","1000"],["a[aria-label=\"Continue without accepting\"]","","1000"],["button#tarteaucitronAllDenied2","","1600"],["button[data-testing=\"cookie-bar-deny-all\"]","","1000"],["button.shared-elements-cookies-popup__modify-button","","1100"],["button.shared-cookies-modal__current-button","","1300"],["button#cookie-custom","","1200"],["button#cookie-save","","1800"],["div.rejectLink___zHIdj","","1000"],[".cmp-root-container >>> .cmp-button-accept-all","","1000"],["a[data-mrf-role=\"userPayToReject\"]","","1000"],["button.ccm--decline-cookies","","1000"],["button#c-s-bn","","1000"],["button#c-rall-bn","","1000"],["button.cm-btn-success","","1000"],["a.p-cookie-layer__accept-selected-cookies-button[nb-cmp=\"button\"]","","1500"],["a.cc-btn-decline","","1000"],["button#pgwl_pur-option-accept-button","","1800"],["button.cc-btn.save","","1000"],["button.btn-reject-additional-cookies","","1000"],["button#c-s-bn","","700"],["button#s-sv-bn","","850"],["button#btn-accept-banner","","1000"],["a.disable-cookies","","1000"],["button[aria-label=\"Accept all\"]","","1000"],["button#ManageCookiesButton","","500"],["button#SaveCookiePreferencesButton","","750"],["button[type=\"submit\"].btn--cookie-consent","","1000"],["button.btn_cookie_savesettings","","500"],["button.btn_cookie_savesettings","","750"],["a[data-cookies-action=\"accept\"]","","1000"],["button.xlt-modalCookiesBtnAllowNecessary","","1000"],["button[data-closecause=\"close-by-submit\"]","","1000"],["span[data-qa-selector=\"gdpr-banner-configuration-button\"]","","300"],["span[data-qa-selector=\"gdpr-banner-accept-selected-button\"]","","500"],["button[data-cookies=\"disallow_all_cookies\"]","","1000"],["button#CookieBoxSaveButton","","1000"],["button.primary","","1000"],["a[onclick=\"denyCookiePolicyAndSetHash();\"]","","1000"],["button#acceptNecessaryCookiesBtn","","1000"],["a.cc-deny","","1000"],["button.cc-deny","","1000"],["button.consent-reject","","1500"],["button[data-omcookie-panel-save=\"min\"]","","3500"],["button#cookieconsent-banner-accept-necessary-button","","1000"],["button[aria-label=\"Accept selected cookies\"]","","1000"],["button.orejime-Modal-saveButton","","1000"],["a[data-tst=\"reject-additional\"]","","1000"],["button.cookie-select-mandatory","","1000"],["a#obcookies_box_close","","1000"],["a[data-button-action=\"essential\"]","","1000"],["button[data-test=\"cookiesAcceptMandatoryButton\"]","","1000"],["button[data-test=\"button-customize\"]","","500"],["button[data-test=\"button-save\"]","","750"],["button.cc-decline","","1000"],["div.approve.button","","1000"],["button[onclick=\"CookieConsent.apply(['ESSENTIAL'])\"]","","1000"],["label[for=\"privacy_pref_optout\"]","","800"],["div#consent_prompt_submit","","1000"],["button.dp_accept","","1000"],["button.cookiebanner__buttons__deny","","1000"],["button.button-refuse","","1000"],["button#cookie-dismiss","","1000"],["a[onclick=\"cmp_pv.cookie.saveConsent('onlyLI');\"]","","1000"],["button[title=\"Pokračovať s nevyhnutnými cookies →\"]","","1000"],["button[name=\"saveCookiesPlusPreferences\"]","","1000"],["div[onclick=\"javascript:ns_gdpr();\"]","","1000"],["button.cookies-banner__button","","1000"],["div#close_button.btn","","1000"],["pie-cookie-banner >>> pie-button[data-test-id=\"actions-necessary-only\"]","","1000"],["button#cmCloseBanner","","1000"],["button#btn-accept-required-banner","","1000"],["button.js-cookies-panel-reject-all","","1000"],["button.acbut.continue","","1000"],["button#btnAcceptPDPA","","1000"],["button#popin_tc_privacy_button_2","","1800"],["button#popin_tc_privacy_button_3","","1000"],["span[aria-label=\"dismiss cookie message\"]","","1000"],["button.CookieBar__Button-decline","","600"],["button.btn.btn-success","","750"],["a[aria-label=\"settings cookies\"]","","600"],["a[onclick=\"Pandectes.fn.savePreferences()\"]","","750"],["[aria-label=\"allow cookies\"]","","1000"],["button[aria-label=\"allow cookies\"]","","1000"],["button.ios-modal-cookie","","1000"],["div.privacy-more-information","","600"],["div#preferences_prompt_submit","","750"],["button[data-cookieman-save]","","1000"],["button.swal2-cancel","","1000"],["button[data-component-name=\"reject\"]","","1000"],["button.fides-reject-all-button","","1000"],["button[title=\"Continue without accepting\"]","","1000"],["div[aria-label=\"Only allow essential cookies\"]","","1000"],["button[title=\"Agree & Continue\"]","","1800"],["button[title=\"Reject All\"]","","1000"],["button[title=\"Agree and continue\"]","","1000"],["span.gmt_refuse","","1000"],["span.btn-btn-save","","1500"],["a#CookieBoxSaveButton","","1000"],["span[data-content=\"WEIGEREN\"]","","1000"],[".is-open .o-cookie__overlay .o-cookie__container .o-cookie__actions .is-space-between button[data-action=\"save\"]","","1000"],["a[onclick=\"consentLayer.buttonAcceptMandatory();\"]","","1000"],["button[id=\"confirmSelection\"]","","2000"],["button[data-action=\"disallow-all\"]","","1000"],["div#cookiescript_reject","","1000"],["button#acceptPrivacyPolicy","","1000"],["button#consent_prompt_reject","","1000"],["dock-privacy-settings >>> bbg-button#decline-all-modal-dialog","","1000"],["button.js-deny","","1000"],["a[role=\"button\"][data-cookie-individual]","","3200"],["a[role=\"button\"][data-cookie-accept]","","3500"],["button[title=\"Deny all cookies\"]","","1000"],["div[data-vtest=\"reject-all\"]","","1000"],["button#consentRefuseAllCookies","","1000"],["button.cookie-consent__button--decline","","1000"],["button#saveChoice","","1000"],["button.p-button.p-privacy-settings__accept-selected-button","","2500"],["button.cookies-ko","","1000"],["button.reject","","1000"],["button.ot-btn-deny","","1000"],["button.js-ot-deny","","1000"],["button.cn-decline","","1000"],["button#js-gateaux-secs-deny","","1500"],["button[data-cookie-consent-accept-necessary-btn]","","1000"],["button.qa-cookie-consent-accept-required","","1500"],[".cvcm-cookie-consent-settings-basic__learn-more-button","","600"],[".cvcm-cookie-consent-settings-detail__footer-button","","750"],["button.accept-all"],[".btn-primary"],["div.tvp-covl__ab","","1000"],["span.decline","","1500"],["a.-confirm-selection","","1000"],["button[data-role=\"reject-rodo\"]","","2500"],["button#moreSettings","","600"],["button#saveSettings","","750"],["button#modalSettingBtn","","1500"],["button#allRejectBtn","","1750"],["button[data-stellar=\"Secondary-button\"]","","1500"],["span.ucm-popin-close-text","","1000"],["a.cookie-essentials","","1800"],["button.Avada-CookiesBar_BtnDeny","","1000"],["button#ez-accept-all","","1000"],["a.cookie__close_text","","1000"],["button[class=\"consent-button agree-necessary-cookie\"]","","1000"],["button#accept-all-gdpr","","2800"],["a#eu-cookie-details-anzeigen-b","","600"],["button.consentManagerButton__NQM","","750"],["button[data-test=\"cookie-finom-card-continue-without-accepting\"]","","2000"],["button#consent_config","","600"],["button#consent_saveConfig","","750"],["button#declineButton","","1000"],["button.cookies-overlay-dialog__save-btn","","1000"],["button.iubenda-cs-reject-btn","1000"],["span.macaronbtn.refuse","","1000"],["a.fs-cc-banner_button-2","","1000"],["a[fs-cc=\"deny\"]","","1000"],["button#ccc-notify-accept","","1000"],["a.reject--cookies","","1000"],["button[aria-label=\"LET ME CHOOSE\"]","","2000"],["button[aria-label=\"Save My Preferences\"]","","2300"],[".dsgvo-cookie-modal .content .dsgvo-cookie .cookie-permission--content .dsgvo-cookie--consent-manager .cookie-removal--inline-manager .cookie-consent--save .cookie-consent--save-button","","1000"],["button[data-test-id=\"decline-button\"]","","2400"],["#pg-host-shadow-root >>> button#pg-configure-btn, #pg-host-shadow-root >>> #purpose-row-SOCIAL_MEDIA input[type=\"checkbox\"], #pg-host-shadow-root >>> button#pg-save-preferences-btn"],["button[title=\"Accept all\"]","","1000"],["button#consent_wall_optout","","1000"],["button.cc-button--rejectAll","","","1000"],["a.eu-cookie-compliance-rocketship--accept-minimal.button","","1000"],["button[class=\"cookie-disclaimer__button-save | button\"]","","1000"],["button[class=\"cookie-disclaimer__button | button button--secondary\"]","","1000"],["button#tarteaucitronDenyAll","","1000"],["button#footer_tc_privacy_button_3","","1000"],["button#saveCookies","","1800"],["button[aria-label=\"dismiss cookie message\"]","","1000"],["div#cookiescript_button_continue_text","","1000"],["div.modal-close","","1000"],["button#wi-CookieConsent_Selection","","1000"],["button#c-t-bn","","1000"],["button#CookieInfoDialogDecline","","1000"],["button[aria-label=\"vypnout personalizaci\"]","","1800"],["button[data-testid=\"cmp-revoke-all\"]","","1000"],["div.agree-mandatory","","1000"],["button[data-cookiefirst-action=\"adjust\"]","","600"],["button[data-cookiefirst-action=\"save\"]","","750"],["a[aria-label=\"deny cookies\"]","","1000"],["button[aria-label=\"deny cookies\"]","","1000"],["a[data-ga-action=\"disallow_all_cookies\"]","","1000"],["itau-cookie-consent-banner >>> button#itau-cookie-consent-banner-reject-cookies-btn","","1000"],[".layout-modal[style] .cookiemanagement .middle-center .intro .text-center .cookie-refuse","","1000"],["button.cc-button.cc-secondary","","1000"],["span.sd-cmp-2jmDj","","1000"],["div.rgpdRefuse","","1000"],["button.modal-cookie-consent-btn-reject","","1000"],["button#myModalCookieConsentBtnContinueWithoutAccepting","","1000"],["button.cookiesBtn__link","","1000"],["button[data-action=\"basic-cookie\"]","","1000"],["button.CookieModal--reject-all","","1000"],["button.consent_agree_essential","","1000"],["span[data-cookieaccept=\"current\"]","","1000"],["button.tarteaucitronDeny","","1800"],["button[data-cookie_version=\"true3\"]","","1000"],["a#DeclineAll","","1000"],["div.new-cookies__btn","","1000"],["button.button-tertiary","","600"],["button[class=\"focus:text-gray-500\"]","","1000"],[".cookie-overlay[style] .cookie-consent .cookie-button-group .cookie-buttons #cookie-deny","","1000"],["button#show-settings-button","","650"],["button#save-settings-button","","800"],["div.cookie-reject","","1000"],["li#sdgdpr_modal_buttons-decline","","1000"],["div#cookieCloseIcon","","1000"],["button#cookieAccepted","","1000"],["button#cookieAccept","","1000"],["div.show-more-options","","500"],["div.save-options","","650"],["button#elc-decline-all-link","","1000"],["a[data-ref-origin=\"POLITICA-COOKIES-DENEGAR-NAVEGANDO-FALDON\"]","","1000"],["button[title=\"القبول والمتابعة\"]","","1800"],["button#consent-reject-all","","1000"],["a[role=\"button\"].button--secondary","","1000"],["button#denyBtn","","1000"],["button#accept-all-cookies","","1000"],["button[data-testid=\"zweiwegen-accept-button\"]","","1000"],["button[data-selector-cookie-button=\"reject-all\"]","","500"],["button[aria-label=\"Reject\"]","","1000"],["button.ens-reject","","1000"],["a#reject-button","","700"],["a#reject-button","","900"],["mon-cb-main >>> mon-cb-home >>> mon-cb-button[e2e-tag=\"acceptAllCookiesButton\"]","","1000"],["button#gdpr_consent_accept_essential_btn","","1000"],["button.essentialCat-button","","3600"],["button#denyallcookie-btn","","1000"],["button#cookie-accept","","1800"],["button[title=\"Close cookie notice without specifying preferences\"]","","1000"],["button#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll","","1000"],["button[aria-label=\"Rechazar\"]","","1000"],["a[data-vtest=\"reject-all\"]","","2000"],["a.js-cookies-info-reject","","1000"],["button[title=\"Got it\"]","","1000"],["button#gr-btn-agree","","1000"],["button#_tealiumModalClose","","1000"],["button.Cmp__action--yes","","2500"],["button[onclick*=\"(()=>{ CassieWidgetLoader.Widget.rejectAll\"]","","1000"],["button.fig-consent-banner__accept","","1000"],["button[onclick*=\"setTimeout(Didomi.setUserAgreeToAll","0);\"]","","1800"],["button#zdf-cmp-deny-btn","","1000"],["button#axeptio_btn_dismiss","","1000"],["a#setCookieLinkIn","","400"],["span.as-js-close-banner","","1000"],["button[value=\"popup_decline\"]","","1000"],[".wt-ecl-button[href=\"#refuse\"]","","1000"],["button#no_consent_btn","","1000"],["button.cc-nb-reject","","1000"],["a.weigeren.active","","1000"],["a.aanvaarden.green.active","","1000"],["button.button--preferences","","900"],["button.button--confirm","","1100"],["button.js-btn-reject-all","","1300"],["button[aria-label=\"Nur notwendige\"]","","1000"],["button[aria-label=\"Only necessary\"]","","1000"],["button[aria-label=\"Seulement nécessaire\"]","","1000"],["button[aria-label=\"Alleen noodzakelijk\"]","","1000"],["button[aria-label=\"Solo necessario\"]","","1000"],["a#optout_link","","1000"],["button[kind=\"purple\"]","","1000"],["button#cookie-consent-decline","","1000"],["button.tiko-btn-primary.tiko-btn-is-small","","1000"],["span.cookie-overlay__modal__footer__decline","","1000"],["button[onclick=\"setCOOKIENOTIFYOK()\"]","","1000"],["button#s-rall-bn","","1000"],["button#privacy_pref_optout","","1000"],["button[data-action=\"reject\"]","","1000"],["button.osano-cm-denyAll","","1000"],["button[data-dismiss=\"modal\"]","","1500"],["button.bh-cookies-popup-save-selection","","1000"],["a.avg-btn-allow","","1000"],["button[title=\"ACEPTAR Y GUARDAR\"]","","1000"],["#cookiescript_reject","","500"],["._brlbs-refuse-btn > ._brlbs-cursor._brlbs-btn","","1000"],["._brlbs-accept > ._brlbs-btn-accept-all","","1000"],[".cookie-footer > button[type=\"submit\"]","","1000"],["button#cookie-banner-agree-all","","1000"],["button[class=\"amgdprcookie-button -allow\"]","","1000"],["button[title=\"Essential cookies only\"]","","1000"],["#redesignCmpWrapper > div > div > a[href^=\"https://cadenaser.com/\"]"],["button.it-cc__button-decline","","1000"],["button#btn-accept-cookie","","1000"],[".in.modal .modal-dialog .modal-content .modal-footer #cc-mainpanel-btnsmain button[onclick=\"document._cookie_consentrjctll.submit()\"]","","1000"],["button#CTA_BUTTON_TEXT_CTA_WRAPPER","","2000"],["button#js_keksNurNotwendigeKnopf","","1000"],[".show .modal-dialog .modal-content .modal-footer #RejectAllCookiesModal","","1000"],["button#accept-selected","","1000"],["div#ccmgt_explicit_accept","","1000"],["button[data-testid=\"privacy-banner-decline-all-btn-desktop\"]","","1000"],["button[title=\"Reject All\"]","","1800"],[".show.gdpr-modal .gdpr-modal-dialog .js-gdpr-modal-1 .modal-body .row .justify-content-center .js-gdpr-accept-all","","1000"],["#cookietoggle, input[id=\"CookieFunctional\"], [value=\"Hyväksy vain valitut\"]"],["a.necessary_cookies","","1200"],["a#r-cookies-wall--btn--accept","","1000"],["button[data-trk-consent=\"J'accepte les cookies\"]","","1000"],["button.cookies-btn","","1000"],[".show.modal .modal-dialog .modal-content .modal-body button[onclick=\"wsConsentReject();\"]","","1000"],[".show.modal .modal-dialog .modal-content .modal-body #cookieStart input[onclick=\"wsConsentDefault();\"]","","1000"],["a.gdpr-cookie-notice-nav-item-decline","","1000"],["span[data-cookieaccept=\"current\"]","","1500"],["button.js_cookie-consent-modal__disagreement","","1000"],["button.tm-button.secondary-invert","","1000"],["div.t_cm_ec_reject_button","","1000"],[".show .modal-dialog .modal-content #essentialCookies","","1000"],["button#UCButtonSettings","","800"],["button#CybotCookiebotDialogBodyLevelButtonAccept","","900"],[".show .modal-dialog .modal-content .modal-footer .s-cookie-transparency__btn-accept-all-and-close","","1000"],["a#accept-cookies","","1000"],["button.gdpr-accept-all-btn","","1000"],["span[data-ga-action=\"disallow_all_cookies\"]","","1000"],["button.cookie-notification-secondary-btn","","1000"],["a[data-gtm-action=\"accept-all\"]","","1000"],["input[value=\"I agree\"]","","1000"],["button[label*=\"Essential\"]","","1800"],["div[class=\"hylo-button\"][role=\"button\"]","","1000"],[".cookie-warning-active .cookie-warning-wrapper .gdpr-cookie-btns a.gdpr_submit_all_button","","1000"],["a#emCookieBtnAccept","","1000"],[".yn-cookies--show .yn-cookies__inner .yn-cookies__page--visible .yn-cookies__footer #yn-cookies__deny-all","","1000"],["button[title=\"Do not sell or share my personal information\"]","","1000"],["#onetrust-consent-sdk button.ot-pc-refuse-all-handler"],["body > div[class=\"x1n2onr6 x1vjfegm\"] div[aria-hidden=\"false\"] > .x1o1ewxj div[class]:last-child > div[aria-hidden=\"true\"] + div div[role=\"button\"] > div[role=\"none\"][class^=\"x1ja2u2z\"][class*=\"x1oktzhs\"]"],["button[onclick=\"cancelCookies()\"]","","1000"],["button.js-save-all-cookies","","2600"],["a#az-cmp-btn-refuse","","1000"],["button.sp-dsgvo-privacy-btn-accept-nothing","","1000"],["pnl-cookie-wall-widget >>> button.pci-button--secondary","","2500"],["button#refuse-cookies-faldon","","1000"],["button.btn-secondary","","1800"],["button[onclick=\"onClickRefuseCookies(event)\"]","","1000"],["input#popup_ok","","1000"],["button[data-test=\"terms-accept-button\"]","","1000"],["button[title=\"Ausgewählten Cookies zustimmen\"]","","1000"],["input[onclick=\"choseSelected()\"]","","1000"],["a#alcaCookieKo","","1000"],["button.Distribution-Close"],["div[class]:has(a[href*=\"holding.wp.pl\"]) div[class]:only-child > button[class*=\" \"] + button:not([class*=\" \"])","","2300"],["body > div[class] > div[class] > div[class]:has(a[href*=\"holding.wp.pl\"]) > div[class] > div[class]:only-child > button:first-child"],["[id=\"CybotCookiebotDialogBodyButtonDecline\"]","","2000"],["button.allow-cookies-once"],["#CybotCookiebotDialogBodyLevelButtonStatisticsInline, #CybotCookiebotDialogBodyLevelButtonMarketingInline, #CybotCookiebotDialogBodyLevelButtonLevelOptinAllowallSelection"],["button#acceptCookies","","1000"],["#cmpwrapper >>> a.cust-btn[onclick*=\"__cmp('setConsent'","1)\"]","","1500"],["button#CybotCookiebotDialogBodyButtonDecline"],["button.cta-size-big.cta-outline"],["pie-cookie-banner >>> [data-test-id=\"actions-manage-prefs\"], pie-cookie-banner >>> #functional >>> .c-switch-input, pie-cookie-banner >>> pie-modal >>> pie-button >>> button[type=\"submit\"]","","1000"],["[data-form=\".eprivacy_optin_decline\"]","","1000"],["#cookie-consent-button","","1500"],["#onetrust-accept-btn-handler"],["com-consent-layer >>> #cmpDenyAll","","2500"],["div[data-project=\"mol-fe-cmp\"] button[class*=\"level1PrimaryButton-\"]:not([class*=\"reject\"])"]];
const hostnamesMap = new Map([["www.google.*",0],["consent.google.*",1],["consent.youtube.com",[1,2]],["facebook.com",3],["instagram.com",4],["sourcepointcmp.bloomberg.com",[5,6,7]],["sourcepointcmp.bloomberg.co.jp",[5,6,7]],["giga.de",7],["theguardian.com",7],["bloomberg.com",[8,9]],["forbes.com",[8,73]],["nike.com",8],["consent.fastcar.co.uk",8],["tapmaster.ca",8],["cmpv2.standard.co.uk",[10,11]],["cmpv2.independent.co.uk",[12,13,14,179]],["wetransfer.com",[15,16]],["spiegel.de",[17,18]],["nytimes.com",[19,175]],["consent.yahoo.com",20],["tumblr.com",21],["fplstatistics.co.uk",22],["fplstatistics.com",22],["e-shop.leonidas.com",23],["cdn.privacy-mgmt.com",[24,25,43,45,46,47,48,93,95,103,110,117,118,119,130,131,132,135,137,138,140,151,168,193,213,226,227,230,231,232,233,250,300,463,586,607,645,663]],["walmart.ca",26],["sams.com.mx",27],["my.tonies.com",28],["cambio-carsharing.de",28],["festool.*",28],["festoolcanada.com",28],["fuso-trucks.*",28],["tracker.fressnapf.de",28],["myfabrics.co.uk",28],["zinus.*",28],["consent.ladbible.com",[29,30]],["consent.unilad.com",[29,30]],["consent.uniladtech.com",[29,30]],["consent.gamingbible.com",[29,30]],["consent.sportbible.com",[29,30]],["consent.tyla.com",[29,30]],["consent.ladbiblegroup.com",[29,30]],["m2o.it",31],["deejay.it",31],["capital.it",31],["ilmattino.it",[31,32]],["leggo.it",[31,32]],["libero.it",31],["tiscali.it",31],["consent-manager.ft.com",[33,34,35]],["hertz.*",36],["mediaworld.it",37],["mediamarkt.*",37],["mediamarktsaturn.com",38],["uber.com",[39,176]],["ubereats.com",[39,176]],["lego.com",40],["ai.meta.com",41],["lilly.com",42],["ilgiornale.it",44],["telekom.com",49],["telekom.de",49],["abola.pt",50],["flytap.com",50],["ansons.de",50],["blick.ch",50],["buienradar.be",50],["crunchyroll.com",50],["digi24.ro",50],["digisport.ro",50],["digitalfoundry.net",50],["egx.net",50],["emirates.com",50],["eurogamer.it",50],["foto-erhardt.de",50],["gmx.*",50],["kizi.com",50],["mail.com",50],["mcmcomiccon.com",50],["nachrichten.at",50],["nintendolife.com",50],["oe24.at",50],["paxsite.com",50],["peacocktv.com",50],["player.pl",50],["plus500.*",50],["pricerunner.com",50],["pricerunner.se",50],["pricerunner.dk",50],["proximus.be",[50,640]],["proximus.com",50],["purexbox.com",50],["pushsquare.com",50],["rugbypass.com",50],["southparkstudios.com",50],["southwest.com",50],["starwarscelebration.com",50],["sweatybetty.com",50],["theaa.ie",50],["thehaul.com",50],["timeextension.com",50],["travelandleisure.com",50],["tunein.com",50],["uefa.com",50],["videoland.com",50],["wizzair.com",50],["wetter.at",50],["dicebreaker.com",[51,52]],["eurogamer.es",[51,52]],["eurogamer.net",[51,52]],["eurogamer.nl",[51,52]],["eurogamer.pl",[51,52]],["eurogamer.pt",[51,52]],["gamesindustry.biz",[51,52]],["reedpop.com",[51,52]],["rockpapershotgun.com",[51,52]],["thepopverse.com",[51,52]],["vg247.com",[51,52]],["videogameschronicle.com",[51,52]],["eurogamer.de",53],["roadtovr.com",54],["jotex.*",54],["mundodeportivo.com",[55,125]],["m.youtube.com",56],["www.youtube.com",56],["ohra.nl",57],["corriere.it",58],["gazzetta.it",58],["oggi.it",58],["cmp.sky.it",59],["tennisassa.fi",60],["formula1.com",61],["f1racing.pl",62],["music.amazon.*",[63,64]],["consent-pref.trustarc.com",65],["highlights.legaseriea.it",66],["calciomercato.com",66],["sosfanta.com",67],["chrono24.*",[68,69]],["wetter.com",70],["youmath.it",71],["pip.gov.pl",72],["dailybuzz.nl",74],["bnn.de",74],["dosenbach.ch",74],["dw.com",74],["kinepolis.*",74],["mediaite.com",74],["nzz.ch",74],["winfuture.de",74],["lippu.fi",74],["racingnews365.com",74],["reifendirekt.ch",74],["vaillant.*",74],["bauhaus.no",75],["bauhaus.se",75],["beko-group.de",75],["billiger.de",75],["burda.com",75],["vanharen.nl",75],["deichmann.com",[75,98,471]],["meraluna.de",75],["slashdot.org",75],["hermann-saunierduval.it",75],["protherm.cz",75],["saunierduval.es",75],["protherm.sk",75],["protherm.ua",75],["saunierduval.hu",75],["saunierduval.ro",75],["saunierduval.at",75],["awb.nl",75],["spar.hu",76],["group.vattenfall.com",76],["mediaset.it",77],["fortune.com",78],["ilrestodelcarlino.it",79],["quotidiano.net",79],["lanazione.it",79],["ilgiorno.it",79],["iltelegrafolivorno.it",79],["auto.it",80],["beauxarts.com",80],["beinsports.com",80],["bfmtv.com",[80,126]],["boursobank.com",80],["boursorama.com",[80,126]],["boursier.com",[80,220]],["brut.media",80],["canalplus.com",80],["decathlon.fr",[80,217]],["diverto.tv",80],["eden-park.com",80],["foodvisor.io",80],["frandroid.com",80],["jobijoba.*",80],["hotelsbarriere.com",80],["intersport.*",[80,190]],["idealista.it",80],["o2.fr",80],["lejdd.fr",[80,125]],["lechorepublicain.fr",80],["la-croix.com",80],["linfo.re",80],["lamontagne.fr",80],["laredoute.fr",80],["largus.fr",80],["leprogres.fr",80],["lesnumeriques.com",80],["libramemoria.com",80],["lopinion.fr",80],["marieclaire.fr",80],["maville.com",80],["michelin.*",80],["midilibre.fr",[80,667]],["meteofrance.com",80],["mondialtissus.fr",80],["orange.fr",80],["orpi.com",80],["oscaro.com",80],["ouest-france.fr",[80,94,126,668]],["parismatch.com",80],["pagesjaunes.fr",80],["programme-television.org",[80,126]],["publicsenat.fr",[80,126]],["rmcbfmplay.com",[80,126]],["science-et-vie.com",[80,125]],["seloger.com",80],["societe.com",80],["suzuki.fr",80],["sudouest.fr",80],["web-agri.fr",80],["nutri-plus.de",81],["americanairlines.*",82],["consent.capital.fr",83],["consent.programme.tv",83],["consent.voici.fr",83],["programme-tv.net",83],["cmpv2.finn.no",84],["cmp.tek.no",[85,86]],["cmp.e24.no",[85,86]],["minmote.no",[85,86]],["cmp.vg.no",[85,86]],["cloud.google.com",87],["developer.android.com",87],["registry.google",87],["safety.google",87],["huffingtonpost.fr",88],["rainews.it",89],["remarkable.com",90],["netzwelt.de",91],["money.it",92],["allocine.fr",94],["jeuxvideo.com",94],["ozap.com",94],["le10sport.com",94],["xataka.com",94],["cmp.fitbook.de",95],["cmp.autobild.de",95],["sourcepoint.sport.de",95],["cmp-sp.tagesspiegel.de",95],["cmp.bz-berlin.de",95],["cmp.cicero.de",95],["cmp.techbook.de",95],["cmp.stylebook.de",95],["cmp2.bild.de",95],["cmp2.freiepresse.de",95],["sourcepoint.wetter.de",95],["consent.finanzen.at",95],["consent.finanzen.net",95],["consent.up.welt.de",95],["sourcepoint.n-tv.de",95],["sourcepoint.kochbar.de",95],["sourcepoint.rtl.de",95],["cmp.computerbild.de",95],["cmp.petbook.de",95],["cmp-sp.siegener-zeitung.de",95],["cmp-sp.sportbuzzer.de",95],["klarmobil.de",95],["technikum-wien.at",96],["eneco.nl",97],["salomon.com",99],["blackpoolgazette.co.uk",100],["lep.co.uk",100],["northamptonchron.co.uk",100],["scotsman.com",100],["shieldsgazette.com",100],["thestar.co.uk",100],["portsmouth.co.uk",100],["sunderlandecho.com",100],["northernirelandworld.com",100],["3addedminutes.com",100],["anguscountyworld.co.uk",100],["banburyguardian.co.uk",100],["bedfordtoday.co.uk",100],["biggleswadetoday.co.uk",100],["bucksherald.co.uk",100],["burnleyexpress.net",100],["buxtonadvertiser.co.uk",100],["chad.co.uk",100],["daventryexpress.co.uk",100],["derbyshiretimes.co.uk",100],["derbyworld.co.uk",100],["derryjournal.com",100],["dewsburyreporter.co.uk",100],["doncasterfreepress.co.uk",100],["falkirkherald.co.uk",100],["fifetoday.co.uk",100],["glasgowworld.com",100],["halifaxcourier.co.uk",100],["harboroughmail.co.uk",100],["harrogateadvertiser.co.uk",100],["hartlepoolmail.co.uk",100],["hemeltoday.co.uk",100],["hucknalldispatch.co.uk",100],["lancasterguardian.co.uk",100],["leightonbuzzardonline.co.uk",100],["lincolnshireworld.com",100],["liverpoolworld.uk",100],["londonworld.com",100],["lutontoday.co.uk",100],["manchesterworld.uk",100],["meltontimes.co.uk",100],["miltonkeynes.co.uk",100],["newcastleworld.com",100],["newryreporter.com",100],["newsletter.co.uk",100],["northantstelegraph.co.uk",100],["northumberlandgazette.co.uk",100],["nottinghamworld.com",100],["peterboroughtoday.co.uk",100],["rotherhamadvertiser.co.uk",100],["stornowaygazette.co.uk",100],["surreyworld.co.uk",100],["thescarboroughnews.co.uk",100],["thesouthernreporter.co.uk",100],["totallysnookered.com",100],["wakefieldexpress.co.uk",100],["walesworld.com",100],["warwickshireworld.com",100],["wigantoday.net",100],["worksopguardian.co.uk",100],["yorkshireeveningpost.co.uk",100],["yorkshirepost.co.uk",100],["eurocard.com",101],["saseurobonusmastercard.se",102],["tver.jp",104],["linkedin.com",105],["elmundo.es",[106,126]],["expansion.com",106],["s-pankki.fi",107],["srf.ch",107],["alternate.de",107],["bayer04.de",107],["douglas.de",107],["dr-beckmann.com",107],["falke.com",107],["fitnessfirst.de",107],["flaschenpost.de",107],["gloeckle.de",107],["hornbach.nl",107],["hypofriend.de",107],["lactostop.de",107],["neumann.com",107],["post.ch",107],["postbank.de",107],["rts.ch",107],["zalando.*",107],["immowelt.de",108],["joyn.*",108],["morenutrition.de",108],["mapillary.com",109],["cmp.seznam.cz",111],["marca.com",112],["raiplay.it",113],["raiplaysound.it",113],["derstandard.at",114],["derstandard.de",114],["faz.net",114],["automoto.it",115],["ansa.it",115],["delladio.it",115],["huffingtonpost.it",115],["internazionale.it",115],["lastampa.it",115],["macitynet.it",115],["moto.it",115],["movieplayer.it",115],["multiplayer.it",115],["repubblica.it",115],["tomshw.it",115],["skuola.net",115],["spaziogames.it",115],["tuttoandroid.net",115],["tuttotech.net",115],["ilgazzettino.it",116],["ilmessaggero.it",116],["ilsecoloxix.it",116],["privacy.motorradonline.de",119],["consent.watson.de",119],["consent.kino.de",119],["consent.desired.de",119],["cmpv2.fn.de",119],["spp.nextpit.de",119],["dailystar.co.uk",[120,121,122,123]],["mirror.co.uk",[120,121,122,123]],["idnes.cz",124],["20minutes.fr",125],["20minutos.es",125],["24sata.hr",125],["abc.es",125],["actu.fr",125],["antena3.com",125],["antena3internacional.com",125],["atresmedia.com",125],["atresmediapublicidad.com",125],["atresmediastudios.com",125],["atresplayer.com",125],["autopista.es",125],["belfasttelegraph.co.uk",125],["bemad.es",125],["bonduelle.it",125],["bonniernews.se",125],["bt.se",125],["cadenadial.com",125],["caracol.com.co",125],["cas.sk",125],["charentelibre.fr",125],["ciclismoafondo.es",125],["cnews.fr",125],["cope.es",125],["correryfitness.com",125],["courrier-picard.fr",125],["cuatro.com",125],["decathlon.nl",125],["decathlon.pl",125],["di.se",125],["diariocordoba.com",125],["diariodenavarra.es",125],["diariosur.es",125],["diariovasco.com",125],["diepresse.com",125],["divinity.es",125],["dn.se",125],["dnevnik.hr",125],["dumpert.nl",125],["ebuyclub.com",125],["edreams.de",125],["edreams.net",125],["elcomercio.es",125],["elconfidencial.com",125],["elcorreo.com",125],["eldesmarque.com",125],["eldiario.es",125],["eldiariomontanes.es",125],["elespanol.com",125],["elle.fr",125],["elpais.com",125],["elperiodico.com",125],["elperiodicodearagon.com",125],["elplural.com",125],["energytv.es",125],["engadget.com",125],["es.ara.cat",125],["euronews.com",125],["europafm.com",125],["expressen.se",125],["factoriadeficcion.com",125],["filmstarts.de",125],["flooxernow.com",125],["folkbladet.nu",125],["footmercato.net",125],["france.tv",125],["france24.com",125],["fussballtransfers.com",125],["fyndiq.se",125],["ghacks.net",125],["gva.be",125],["hbvl.be",125],["heraldo.es",125],["hoy.es",125],["ideal.es",125],["idealista.pt",125],["krone.at",125],["kurier.at",125],["lacoste.com",125],["ladepeche.fr",125],["lalibre.be",125],["lanouvellerepublique.fr",125],["larazon.es",125],["lasexta.com",125],["lasprovincias.es",125],["latribune.fr",125],["lavanguardia.com",125],["laverdad.es",125],["lavozdegalicia.es",125],["leboncoin.fr",125],["lecturas.com",125],["ledauphine.com",125],["lejsl.com",125],["leparisien.fr",125],["lesoir.be",125],["letelegramme.fr",125],["libremercado.com",125],["localeyes.dk",125],["los40.com",125],["lotoquebec.com",125],["lunion.fr",125],["m6.fr",125],["marianne.cz",125],["marmiton.org",125],["mediaset.es",125],["melodia-fm.com",125],["metronieuws.nl",125],["moviepilot.de",125],["mtmad.es",125],["multilife.com.pl",125],["naszemiasto.pl",125],["nationalgeographic.com.es",125],["nicematin.com",125],["nieuwsblad.be",125],["notretemps.com",125],["numerama.com",125],["okdiario.com",125],["ondacero.es",125],["podiumpodcast.com",125],["portail.lotoquebec.com",125],["profil.at",125],["public.fr",125],["publico.es",125],["radiofrance.fr",125],["rankia.com",125],["rfi.fr",125],["rossmann.pl",125],["rtbf.be",[125,217]],["rtl.lu",125],["sensacine.com",125],["sfgame.net",125],["shure.com",125],["silicon.es",125],["sncf-connect.com",125],["sport.es",125],["sydsvenskan.se",125],["techcrunch.com",125],["telegraaf.nl",125],["telequebec.tv",125],["tf1.fr",125],["tradingsat.com",125],["trailrun.es",125],["video-streaming.orange.fr",125],["xpress.fr",125],["ivoox.com",126],["as.com",126],["slam.nl",126],["bienpublic.com",126],["funradio.fr",126],["gamepro.de",[126,187,188]],["lemon.fr",126],["lexpress.fr",126],["shadow.tech",126],["letemps.ch",126],["mein-mmo.de",126],["heureka.sk",126],["film.at",126],["dhnet.be",126],["lesechos.fr",[126,222]],["marianne.net",[126,217]],["jeanmarcmorandini.com",[126,218]],["dna.fr",126],["sudinfo.be",126],["europe1.fr",[126,218]],["rtl.be",[126,217]],["reviewingthebrew.com",126],["jaysjournal.com",126],["reignoftroy.com",126],["ryobitools.eu",[127,128]],["americanexpress.com",129],["consent.radiotimes.com",132],["sp-consent.szbz.de",133],["cmp.omni.se",134],["cmp.svd.se",134],["cmp.aftonbladet.se",134],["cmp.tv.nu",134],["consent.economist.com",136],["studentagency.cz",136],["cmpv2.foundryco.com",137],["cmpv2.infoworld.com",137],["cmpv2.arnnet.com.au",137],["sp-cdn.pcgames.de",138],["sp-cdn.pcgameshardware.de",138],["consentv2.sport1.de",138],["cmp.mz.de",138],["cmpv2.tori.fi",139],["consent.spielaffe.de",141],["bondekompaniet.no",142],["degiro.*",142],["epochtimes.de",142],["vikingline.com",142],["tfl.gov.uk",142],["drklein.de",142],["hildegardis-krankenhaus.de",142],["kleer.se",142],["lekiaviation.com",142],["lotto.pl",142],["mineralstech.com",142],["volunteer.digitalboost.org.uk",142],["starhotels.com",142],["tefl.com",142],["universumglobal.com",142],["tui.com",143],["rexel.*",144],["csob.sk",145],["greenstuffworld.com",146],["morele.net",[147,148]],["1und1.de",149],["infranken.de",150],["cmp.tvtoday.de",151],["cmp.tvspielfilm.de",151],["cmp.bunte.de",151],["cmp.chip.de",151],["cmp.focus.de",[151,497]],["estadiodeportivo.com",152],["tameteo.*",152],["tempo.pt",152],["meteored.*",152],["pogoda.com",152],["yourweather.co.uk",152],["tempo.com",152],["theweather.net",152],["tiempo.com",152],["ilmeteo.net",152],["daswetter.com",152],["kicker.de",153],["formulatv.com",154],["web.de",155],["lefigaro.fr",156],["linternaute.com",157],["consent.caminteresse.fr",158],["volksfreund.de",159],["rp-online.de",159],["dailypost.co.uk",160],["the-express.com",160],["vide-greniers.org",160],["bluray-disc.de",161],["elio-systems.com",161],["stagatha-fachklinik.de",161],["tarife.mediamarkt.de",161],["lz.de",161],["gaggenau.com",161],["saturn.de",162],["eltiempo.es",[163,164]],["otempo.pt",165],["atlasformen.*",166],["cmp-sp.goettinger-tageblatt.de",167],["cmp-sp.saechsische.de",167],["cmp-sp.ln-online.de",167],["cz.de",167],["dewezet.de",167],["dnn.de",167],["haz.de",167],["gnz.de",167],["landeszeitung.de",167],["lvz.de",167],["maz-online.de",167],["ndz.de",167],["op-marburg.de",167],["ostsee-zeitung.de",167],["paz-online.de",167],["reisereporter.de",167],["rga.de",167],["rnd.de",167],["siegener-zeitung.de",167],["sn-online.de",167],["solinger-tageblatt.de",167],["sportbuzzer.de",167],["szlz.de",167],["tah.de",167],["torgauerzeitung.de",167],["waz-online.de",167],["privacy.maennersache.de",167],["sinergy.ch",169],["agglo-valais-central.ch",169],["biomedcentral.com",170],["hsbc.*",171],["hsbcnet.com",171],["hsbcinnovationbanking.com",171],["create.hsbc",171],["gbm.hsbc.com",171],["hsbc.co.uk",172],["internationalservices.hsbc.com",172],["history.hsbc.com",172],["about.hsbc.co.uk",173],["privatebanking.hsbc.com",174],["independent.co.uk",177],["privacy.crash.net",177],["the-independent.com",178],["argos.co.uk",180],["poco.de",[181,182]],["moebelix.*",181],["moemax.*",181],["xxxlutz.*",181],["xxxlesnina.*",181],["moebel24.ch",182],["meubles.fr",182],["meubelo.nl",182],["moebel.de",182],["lipo.ch",183],["schubiger.ch",184],["aedt.de",185],["berlin-live.de",185],["bike-magazin.de",185],["connect.de",185],["gutefrage.net",185],["insideparadeplatz.ch",185],["morgenpost.de",185],["play3.de",185],["thueringen24.de",185],["pdfupload.io",186],["gamestar.de",[187,188,226]],["verksamt.se",189],["acmemarkets.com",190],["amtrak.com",190],["beko.com",190],["bepanthen.com.au",190],["berocca.com.au",190],["booking.com",190],["carrefour.fr",190],["centrum.sk",190],["claratyne.com.au",190],["credit-suisse.com",190],["ceskatelevize.cz",190],["deporvillage.*",190],["de.vanguard",190],["dhl.de",190],["digikey.*",190],["drafthouse.com",190],["dunelm.com",190],["eurosport.fr",190],["fello.se",190],["fielmann.*",190],["flashscore.fr",190],["flightradar24.com",190],["fnac.es",190],["foodandwine.com",190],["fourseasons.com",190],["khanacademy.org",190],["konami.com",190],["jll.*",190],["jobs.redbull.com",190],["hellenicbank.com",190],["gemini.pl",190],["groceries.asda.com",190],["lamborghini.com",190],["menshealth.com",190],["n26.com",190],["nintendo.com",190],["nokia.com",190],["oneweb.net",190],["omnipod.com",190],["oralb.*",190],["panasonic.com",190],["parkside-diy.com",190],["pluto.tv",190],["popularmechanics.com",190],["polskieradio.pl",190],["pringles.com",190],["questdiagnostics.com",190],["radissonhotels.com",190],["ricardo.ch",190],["rockstargames.com",190],["rte.ie",190],["salesforce.com",190],["samsonite.*",190],["spiele.heise.de",190],["spirit.com",190],["stenaline.co.uk",190],["swisscom.ch",190],["swisspass.ch",190],["technologyfromsage.com",190],["telenet.be",190],["tntsports.co.uk",190],["theepochtimes.com",190],["toujeo.com",190],["uber-platz.de",190],["vinted.com",190],["wallapop.com",190],["wickes.co.uk",190],["workingtitlefilms.com",190],["vattenfall.de",190],["winparts.fr",190],["yoigo.com",190],["zoominfo.com",190],["allegiantair.com",191],["hallmarkchannel.com",191],["incorez.com",191],["noovle.com",191],["otter.ai",191],["plarium.com",191],["telsy.com",191],["timenterprise.it",191],["tim.it",191],["tradersunion.com",191],["fnac.*",191],["yeti.com",191],["here.com",[192,676]],["vodafone.com",192],["cmp.heise.de",194],["cmp.am-online.com",194],["cmp.motorcyclenews.com",194],["consent.newsnow.co.uk",194],["cmp.todays-golfer.com",194],["spp.nextpit.com",194],["koeser.com",195],["shop.schaette-pferd.de",195],["schaette.de",195],["central-bb.de",196],["fitnessfoodcorner.de",197],["kuehlungsborn.de",198],["espressocoffeeshop.com",199],["brainmarket.pl",200],["getroots.app",201],["cart-in.re",[202,603]],["prestonpublishing.pl",203],["zara.com",204],["lepermislibre.fr",204],["negociardivida.spcbrasil.org.br",205],["pons.com",206],["adidas.*",207],["privacy.topreality.sk",208],["privacy.autobazar.eu",208],["vu.lt",209],["adnkronos.com",[210,211]],["cornwalllive.com",[210,211]],["cyprus-mail.com",[210,211]],["einthusan.tv",[210,211]],["informazione.it",[210,211]],["mymovies.it",[210,211]],["tuttoeuropei.com",[210,211]],["video.lacnews24.it",[210,211]],["protothema.gr",210],["flash.gr",210],["taxscouts.com",212],["online.no",214],["telenor.no",214],["austrian.com",215],["lufthansa.com",215],["kampfkunst-herz.de",216],["glow25.de",216],["h-f.at",216],["hornetsecurity.com",216],["kayzen.io",216],["wasserkunst-hamburg.de",216],["zahnspange-oelde.de",216],["bnc.ca",217],["egora.fr",217],["engelvoelkers.com",217],["estrategiasdeinversion.com",217],["festo.com",217],["franceinfo.fr",217],["francebleu.fr",217],["francemediasmonde.com",217],["geny.com",217],["giphy.com",217],["idealista.com",217],["infolibre.es",217],["information.tv5monde.com",217],["ing.es",217],["knipex.de",217],["laprovence.com",217],["lemondeinformatique.fr",217],["libertaddigital.com",217],["mappy.com",217],["orf.at",217],["philibertnet.com",217],["researchgate.net",217],["standaard.be",217],["stroilioro.com",217],["taxfix.de",217],["telecinco.es",217],["vistaalegre.com",217],["zimbra.free.fr",217],["usinenouvelle.com",219],["reussir.fr",221],["bruendl.at",223],["latamairlines.com",224],["elisa.ee",225],["baseendpoint.brigitte.de",226],["baseendpoint.gala.de",226],["baseendpoint.haeuser.de",226],["baseendpoint.stern.de",226],["baseendpoint.urbia.de",226],["cmp.tag24.de",226],["cmp-sp.handelsblatt.com",226],["cmpv2.berliner-zeitung.de",226],["golem.de",226],["consent.t-online.de",226],["sp-consent.stuttgarter-nachrichten.de",227],["sp-consent.stuttgarter-zeitung.de",227],["regjeringen.no",228],["sp-manager-magazin-de.manager-magazin.de",229],["consent.11freunde.de",229],["centrum24.pl",234],["replay.lsm.lv",235],["ltv.lsm.lv",235],["bernistaba.lsm.lv",235],["verl.de",236],["cubo-sauna.de",236],["mbl.is",236],["auto-medienportal.net",236],["mobile.de",237],["cookist.it",238],["fanpage.it",238],["geopop.it",238],["lexplain.it",238],["royalmail.com",239],["gmx.net",240],["gmx.ch",241],["mojehobby.pl",242],["super-hobby.*",242],["sp.stylevamp.de",243],["cmp.wetteronline.de",243],["audi.*",244],["easyjet.com",244],["experian.co.uk",244],["postoffice.co.uk",244],["tescobank.com",244],["internetaptieka.lv",[245,246]],["wells.pt",247],["dskdirect.bg",248],["cmpv2.dba.dk",249],["spcmp.crosswordsolver.com",250],["ecco.com",251],["georgjensen.com",251],["thomann.*",252],["landkreis-kronach.de",253],["effectiefgeven.be",254],["northcoast.com",254],["chaingpt.org",254],["bandenconcurrent.nl",255],["bandenexpert.be",255],["reserved.com",256],["metro.it",257],["makro.es",257],["metro.sk",257],["metro-cc.hr",257],["makro.nl",257],["metro.bg",257],["metro.at",257],["metro-tr.com",257],["metro.de",257],["metro.fr",257],["makro.cz",257],["metro.ro",257],["makro.pt",257],["makro.pl",257],["sklepy-odido.pl",257],["rastreator.com",257],["metro.ua",258],["metro.rs",258],["metro-kz.com",258],["metro.md",258],["metro.hu",258],["metro-cc.ru",258],["metro.pk",258],["balay.es",259],["constructa.com",259],["dafy-moto.com",260],["akku-shop.nl",261],["akkushop-austria.at",261],["akkushop-b2b.de",261],["akkushop.de",261],["akkushop.dk",261],["batterie-boutique.fr",261],["akkushop-schweiz.ch",262],["evzuttya.com.ua",263],["eobuv.cz",263],["eobuwie.com.pl",263],["ecipele.hr",263],["eavalyne.lt",263],["chaussures.fr",263],["ecipo.hu",263],["eobuv.sk",263],["epantofi.ro",263],["epapoutsia.gr",263],["escarpe.it",263],["eschuhe.de",263],["obuvki.bg",263],["zapatos.es",263],["swedbank.ee",264],["mudanzavila.es",265],["bienmanger.com",266],["gesipa.*",267],["gesipausa.com",267],["beckhoff.com",267],["zitekick.dk",268],["eltechno.dk",268],["okazik.pl",268],["batteryempire.*",269],["maxi.rs",270],["garmin.com",271],["invisalign.*",271],["one4all.ie",271],["osprey.com",271],["wideroe.no",272],["bmw.*",273],["kijk.nl",274],["nordania.dk",275],["danskebank.*",275],["danskeci.com",275],["danica.dk",275],["dehn.*",276],["gewerbegebiete.de",277],["cordia.fr",278],["vola.fr",279],["lafi.fr",280],["skyscanner.*",281],["coolblue.*",282],["chipotle.com",283],["sanareva.*",284],["atida.fr",284],["bbva.*",285],["bbvauk.com",285],["expertise.unimi.it",286],["altenberg.de",287],["vestel.es",288],["tsb.co.uk",289],["buienradar.nl",[290,291]],["linsenplatz.de",292],["budni.de",293],["erstecardclub.hr",293],["teufel.de",[294,295]],["abp.nl",296],["simplea.sk",297],["flip.bg",298],["kiertokanki.com",299],["leirovins.be",301],["vias.be",302],["edf.fr",303],["virbac.com",303],["diners.hr",303],["squarehabitat.fr",303],["arbitrobancariofinanziario.it",304],["ivass.it",304],["economiapertutti.bancaditalia.it",304],["smit-sport.de",305],["gekko-computer.de",305],["jysk.al",306],["go-e.com",307],["malerblatt-medienservice.de",308],["architekturbuch.de",308],["medienservice-holz.de",308],["leuchtstark.de",308],["casius.nl",309],["coolinarika.com",310],["giga-hamburg.de",310],["vakgaragevannunen.nl",310],["fortuluz.es",310],["finna.fi",310],["eurogrow.es",310],["topnatur.cz",310],["topnatur.eu",310],["vakgarage.nl",310],["whufc.com",310],["zomaplast.cz",310],["envafors.dk",311],["dabbolig.dk",[312,313]],["daruk-emelok.hu",314],["exakta.se",315],["larca.de",316],["roli.com",317],["okazii.ro",318],["lr-shop-direkt.de",318],["portalprzedszkolny.pl",318],["tgvinoui.sncf",319],["l-bank.de",320],["interhyp.de",321],["indigoneo.*",322],["transparency.meta.com",323],["dojusagro.lt",324],["eok.ee",324],["kripa.it",324],["nextdaycatering.co.uk",324],["safran-group.com",324],["sr-ramenendeuren.be",324],["ilovefreegle.org",324],["tribexr.com",324],["understandingsociety.ac.uk",324],["bestbuycyprus.com",325],["strato.*",326],["strato-hosting.co.uk",326],["auto.de",327],["contentkingapp.com",328],["comune.palermo.it",329],["get-in-engineering.de",330],["spp.nextpit.es",331],["spp.nextpit.it",332],["spp.nextpit.com.br",333],["spp.nextpit.fr",334],["otterbox.com",335],["stoertebeker-brauquartier.com",336],["stoertebeker.com",336],["stoertebeker-eph.com",336],["aparts.pl",337],["sinsay.com",[338,339]],["benu.cz",340],["stockholmresilience.org",341],["ludvika.se",341],["kammarkollegiet.se",341],["cazenovecapital.com",342],["statestreet.com",343],["beopen.lv",344],["cesukoncertzale.lv",345],["dodo.fr",346],["pepper.it",347],["pepper.pl",347],["preisjaeger.at",347],["mydealz.de",347],["dealabs.com",347],["hotukdeals.com",347],["chollometro.com",347],["makelaarsland.nl",348],["bezirk-schwaben.de",349],["dorfen.de",349],["nutsinbulk.co.uk",350],["bricklink.com",351],["bestinver.es",352],["icvs2023.conf.tuwien.ac.at",353],["racshop.co.uk",[354,355]],["baabuk.com",356],["sapien.io",356],["tradedoubler.com",356],["app.lepermislibre.fr",357],["multioferta.es",358],["testwise.com",[359,360]],["tonyschocolonely.com",361],["fitplus.is",361],["fransdegrebber.nl",361],["lilliputpress.ie",361],["lexibo.com",361],["marin-milou.com",361],["dare2tri.com",361],["t3micro.*",361],["la-vie-naturelle.com",[362,363]],["inovelli.com",364],["uonetplus.vulcan.net.pl",[365,366]],["consent.helagotland.se",367],["oper.koeln",[368,369]],["deezer.com",370],["hoteldesartssaigon.com",371],["autoritedelaconcurrence.fr",372],["groupeonepoint.com",372],["geneanet.org",372],["carrieres.groupegalerieslafayette.com",372],["immo-banques.fr",372],["lingvanex.com",372],["turncamp.com",373],["ejobs.ro",[374,375]],["kupbilecik.*",[376,377]],["coolbe.com",378],["serienjunkies.de",379],["computerhoy.20minutos.es",380],["clickskeks.at",381],["clickskeks.de",381],["abt-sportsline.de",381],["exemplary.ai",382],["forbo.com",382],["stores.sk",382],["nerdstar.de",382],["prace.cz",382],["profesia.sk",382],["profesia.cz",382],["pracezarohem.cz",382],["atmoskop.cz",382],["seduo.sk",382],["seduo.cz",382],["teamio.com",382],["arnold-robot.com",382],["cvonline.lt",382],["cv.lv",382],["cv.ee",382],["dirbam.lt",382],["visidarbi.lv",382],["otsintood.ee",382],["webtic.it",382],["gerth.de",383],["pamiatki.pl",384],["initse.com",385],["salvagny.org",386],["augsburger-allgemeine.de",387],["stabila.com",388],["stwater.co.uk",389],["suncalc.org",[390,391]],["swisstph.ch",392],["taxinstitute.ie",393],["get-in-it.de",394],["tempcover.com",[395,396]],["guildford.gov.uk",397],["easyparts.*",[398,399]],["easyparts-recambios.es",[398,399]],["easyparts-rollerteile.de",[398,399]],["drimsim.com",400],["canyon.com",[401,402]],["vevovo.be",[403,404]],["vendezvotrevoiture.be",[403,404]],["wirkaufendeinauto.at",[403,404]],["vikoberallebiler.dk",[403,404]],["wijkopenautos.nl",[403,404]],["vikoperdinbil.se",[403,404]],["noicompriamoauto.it",[403,404]],["vendezvotrevoiture.fr",[403,404]],["compramostucoche.es",[403,404]],["wijkopenautos.be",[403,404]],["auto-doc.*",405],["autodoc.*",405],["autodoc24.*",405],["topautoosat.fi",405],["autoteiledirekt.de",405],["autoczescionline24.pl",405],["tuttoautoricambi.it",405],["onlinecarparts.co.uk",405],["autoalkatreszek24.hu",405],["autodielyonline24.sk",405],["reservdelar24.se",405],["pecasauto24.pt",405],["reservedeler24.co.no",405],["piecesauto24.lu",405],["rezervesdalas24.lv",405],["besteonderdelen.nl",405],["recambioscoche.es",405],["antallaktikaexartimata.gr",405],["piecesauto.fr",405],["teile-direkt.ch",405],["lpi.org",406],["divadelniflora.cz",407],["mahle-aftermarket.com",408],["refurbed.*",409],["eingutertag.org",410],["flyingtiger.com",[410,554]],["borgomontecedrone.it",410],["maharishistore.com",410],["recaro-shop.com",410],["gartenhotel-crystal.at",410],["fayn.com",411],["serica-watches.com",411],["sklavenitis.gr",412],["eam-netz.de",413],["umicore.*",414],["veiligverkeer.be",414],["vsv.be",414],["dehogerielen.be",414],["gera.de",415],["mfr-chessy.fr",416],["mfr-lamure.fr",416],["mfr-saint-romain.fr",416],["mfr-lapalma.fr",416],["mfrvilliemorgon.asso.fr",416],["mfr-charentay.fr",416],["mfr.fr",416],["nationaltrust.org.uk",417],["hej-natural.*",418],["ib-hansmeier.de",419],["rsag.de",420],["esaa-eu.org",420],["aknw.de",420],["answear.*",421],["theprotocol.it",[422,423]],["lightandland.co.uk",424],["etransport.pl",425],["wohnen-im-alter.de",426],["johnmuirhealth.com",[427,428]],["markushaenni.com",429],["airbaltic.com",430],["gamersgate.com",430],["zorgzaam010.nl",431],["etos.nl",432],["paruvendu.fr",433],["privacy.bazar.sk",434],["hennamorena.com",435],["newsello.pl",436],["porp.pl",437],["golfbreaks.com",438],["lieferando.de",439],["just-eat.*",439],["justeat.*",439],["pyszne.pl",439],["lieferando.at",439],["takeaway.com",439],["thuisbezorgd.nl",439],["holidayhypermarket.co.uk",440],["unisg.ch",441],["wassererleben.ch",441],["psgaz.pl",442],["play-asia.com",443],["centralthe1card.com",444],["atu.de",445],["atu-flottenloesungen.de",445],["but.fr",445],["edeka.de",445],["fortuneo.fr",445],["maif.fr",445],["meteo.tf1.fr",445],["particuliers.sg.fr",445],["sparkasse.at",445],["group.vig",445],["tf1info.fr",445],["dpdgroup.com",446],["dpd.com",446],["cosmosdirekt.de",446],["bstrongoutlet.pt",447],["isarradweg.de",[448,449]],["flaxmanestates.com",449],["inland-casas.com",449],["finlayson.fi",[450,451]],["cowaymega.ca",[450,451]],["arktis.de",452],["desktronic.de",452],["belleek.com",452],["brauzz.com",452],["cowaymega.com",452],["dockin.de",452],["dryrobe.com",[452,453]],["formswim.com",452],["hairtalk.se",452],["hallmark.co.uk",[452,453]],["loopearplugs.com",[452,453]],["oleus.com",452],["peopleofshibuya.com",452],["pullup-dip.com",452],["sanctum.shop",452],["tbco.com",452],["desktronic.*",453],["hq-germany.com",453],["tepedirect.com",453],["maxi-pet.ro",453],["paper-republic.com",453],["pullup-dip.*",453],["vitabiotics.com",453],["smythstoys.com",454],["beam.co.uk",[455,456]],["autobahn.de",457],["krakow.pl",458],["shop.app",459],["shopify.com",459],["wufoo.com",460],["consent.dailymotion.com",461],["laposte.fr",461],["help.instagram.com",462],["consent-manager.thenextweb.com",464],["consent-cdn.zeit.de",465],["coway-usa.com",466],["steiners.shop",467],["ecmrecords.com",468],["malaikaraiss.com",468],["koch-mit.de",468],["zeitreisen.zeit.de",468],["wefashion.com",469],["merkur.dk",470],["ionos.*",472],["omegawatches.com",473],["carefully.be",474],["aerotime.aero",474],["rocket-league.com",475],["dws.com",476],["bosch-homecomfort.com",477],["elmleblanc-optibox.fr",477],["monservicechauffage.fr",477],["boschrexroth.com",477],["home-connect.com",478],["lowrider.at",[479,480]],["mesto.de",481],["intersport.gr",482],["intersport.bg",482],["intersport.com.cy",482],["intersport.ro",482],["ticsante.com",483],["techopital.com",483],["millenniumprize.org",484],["hepster.com",485],["peterstaler.de",486],["blackforest-still.de",486],["tiendaplayaundi.com",487],["ajtix.co.uk",488],["raja.fr",489],["rajarani.de",489],["rajapack.*",[489,490]],["avery-zweckform.com",491],["1xinternet.com",491],["futterhaus.de",491],["dasfutterhaus.at",491],["frischeparadies.de",491],["fmk-steuer.de",491],["selgros.de",491],["transgourmet.de",491],["mediapart.fr",492],["athlon.com",493],["alumniportal-deutschland.org",494],["snoopmedia.com",494],["myguide.de",494],["daad.de",494],["cornelsen.de",[495,496]],["vinmonopolet.no",498],["tvp.info",499],["tvp.pl",499],["tvpworld.com",499],["brtvp.pl",499],["tvpparlament.pl",499],["belsat.eu",499],["warnung.bund.de",500],["mediathek.lfv-bayern.de",501],["allegro.*",502],["allegrolokalnie.pl",502],["ceneo.pl",502],["czc.cz",502],["eon.pl",[503,504]],["ylasatakunta.fi",[505,506]],["mega-image.ro",507],["louisvuitton.com",508],["bodensee-airport.eu",509],["department56.com",510],["allendesignsstudio.com",510],["designsbylolita.co",510],["shop.enesco.com",510],["savoriurbane.com",511],["miumiu.com",512],["church-footwear.com",512],["clickdoc.fr",513],["car-interface.com",514],["monolithdesign.it",514],["thematchahouse.com",514],["smileypack.de",[515,516]],["finom.co",517],["orange.es",[518,519]],["fdm-travel.dk",520],["hummel.dk",520],["jysk.nl",520],["power.no",520],["skousen.dk",520],["velliv.dk",520],["whiteaway.com",520],["whiteaway.no",520],["whiteaway.se",520],["skousen.no",520],["energinet.dk",520],["elkjop.no",520],["medimax.de",521],["costautoricambi.com",522],["lotto.it",522],["readspeaker.com",522],["team.blue",522],["ibistallinncenter.ee",523],["aaron.ai",524],["futureverse.com",525],["tandem.co.uk",525],["insights.com",526],["thebathcollection.com",527],["coastfashion.com",[528,529]],["oasisfashion.com",[528,529]],["warehousefashion.com",[528,529]],["misspap.com",[528,529]],["karenmillen.com",[528,529]],["boohooman.com",[528,529]],["hdt.de",530],["wolt.com",531],["myprivacy.dpgmedia.nl",532],["myprivacy.dpgmedia.be",532],["www.dpgmediagroup.com",532],["xohotels.com",533],["sim24.de",534],["tnt.com",535],["uza.be",536],["uzafoundation.be",536],["uzajobs.be",536],["bergzeit.*",[537,538]],["cinemas-lumiere.com",539],["cdiscount.com",540],["brabus.com",541],["roborock.com",542],["strumentimusicali.net",543],["maisonmargiela.com",544],["webfleet.com",545],["dragonflyshipping.ca",546],["broekhuis.nl",547],["groningenairport.nl",547],["nemck.cz",548],["zdfheute.de",549],["sap-press.com",550],["roughguides.com",[551,552]],["korvonal.com",553],["rexbo.*",555],["itau.com.br",556],["bbg.gv.at",557],["portal.taxi.eu",558],["topannonces.fr",559],["homap.fr",560],["artifica.fr",561],["plan-interactif.com",561],["ville-cesson.fr",561],["moismoliere.com",562],["unihomes.co.uk",563],["bkk.hu",564],["coiffhair.com",565],["ptc.eu",566],["ziegert-group.com",[567,673]],["lassuranceretraite.fr",568],["interieur.gouv.fr",568],["toureiffel.paris",568],["economie.gouv.fr",568],["education.gouv.fr",568],["livoo.fr",568],["su.se",568],["zappo.fr",568],["smdv.de",569],["digitalo.de",569],["petiteamelie.*",570],["mojanorwegia.pl",571],["koempf24.ch",[572,573]],["teichitekten24.de",[572,573]],["koempf24.de",[572,573]],["wolff-finnhaus-shop.de",[572,573]],["asnbank.nl",574],["blgwonen.nl",574],["regiobank.nl",574],["snsbank.nl",574],["vulcan.net.pl",[575,576]],["ogresnovads.lv",577],["partenamut.be",578],["pirelli.com",579],["unicredit.it",580],["effector.pl",581],["zikodermo.pl",[582,583]],["devolksbank.nl",584],["caixabank.es",585],["cyberport.de",587],["cyberport.at",587],["slevomat.cz",588],["kfzparts24.de",589],["runnersneed.com",590],["aachener-zeitung.de",591],["sportpursuit.com",592],["druni.es",[593,604]],["druni.pt",[593,604]],["delta.com",594],["onliner.by",[595,596]],["vejdirektoratet.dk",597],["usaa.com",598],["consorsbank.de",599],["metroag.de",600],["kupbilecik.pl",601],["oxfordeconomics.com",602],["routershop.nl",603],["woo.pt",603],["e-jumbo.gr",605],["alza.*",606],["rmf.fm",608],["rmf24.pl",608],["tracfone.com",609],["lequipe.fr",610],["global.abb",611],["gala.fr",612],["purepeople.com",613],["3sat.de",614],["zdf.de",614],["filmfund.lu",615],["welcometothejungle.com",615],["triblive.com",616],["rai.it",617],["fbto.nl",618],["europa.eu",619],["caisse-epargne.fr",620],["banquepopulaire.fr",620],["bigmammagroup.com",621],["studentagency.sk",621],["studentagency.eu",621],["winparts.be",622],["winparts.nl",622],["winparts.eu",623],["winparts.ie",623],["winparts.se",623],["sportano.*",[624,625]],["crocs.*",626],["chronext.ch",627],["chronext.de",627],["chronext.at",627],["chronext.com",628],["chronext.co.uk",628],["chronext.fr",629],["chronext.nl",630],["chronext.it",631],["galerieslafayette.com",632],["bazarchic.com",633],["stilord.*",634],["tiko.pt",635],["nsinternational.com",636],["meinbildkalender.de",637],["gls-group.com",638],["gls-group.eu",638],["chilis.com",639],["account.bhvr.com",641],["everand.com",641],["lucidchart.com",641],["intercars.ro",[641,642]],["scribd.com",641],["guidepoint.com",641],["erlebnissennerei-zillertal.at",643],["hintertuxergletscher.at",643],["tiwag.at",643],["playseatstore.com",644],["swiss-sport.tv",646],["targobank-magazin.de",647],["zeit-verlagsgruppe.de",647],["online-physiotherapie.de",647],["kieferorthopaede-freisingsmile.de",648],["nltraining.nl",649],["kmudigital.at",650],["mintysquare.com",651],["consent.thetimes.com",652],["cadenaser.com",653],["berlinale.de",654],["lebonlogiciel.com",655],["pharmastar.it",656],["washingtonpost.com",657],["brillenplatz.de",658],["angelplatz.de",658],["dt.mef.gov.it",659],["raffeldeals.com",660],["stepstone.de",661],["kobo.com",662],["zoxs.de",664],["offistore.fi",665],["collinsaerospace.com",666],["radioapp.lv",669],["hagengrote.de",670],["hemden-meister.de",670],["vorteilshop.com",671],["capristores.gr",672],["getaround.com",674],["technomarket.bg",675],["epiphone.com",677],["gibson.com",677],["maestroelectronics.com",677],["cropp.com",[678,679]],["housebrand.com",[678,679]],["mohito.com",[678,679]],["autoczescizielonki.pl",680],["b-s.de",681],["novakid.pl",682],["piecesauto24.com",683],["earpros.com",684],["portalridice.cz",685],["kitsapcu.org",686],["nutsinbulk.*",687],["berlin-buehnen.de",688],["metropoliten.rs",689],["educa2.madrid.org",690],["immohal.de",691],["sourcepoint.theguardian.com",692],["rtlplay.be",693],["natgeotv.com",693],["llama.com",694],["meta.com",694],["setasdesevilla.com",695],["cruyff-foundation.org",696],["allianz.*",697],["energiedirect-bayern.de",698],["postnl.be",699],["postnl.nl",699],["sacyr.com",700],["volkswagen-newsroom.com",701],["openbank.*",702],["tagus-eoficina.grupogimeno.com",703],["tidal.com",704],["knax.de",705],["ordblindenetvaerket.dk",706],["boligbeton.dk",706],["dukh.dk",706],["pevgrow.com",707],["ya.ru",708],["ipolska24.pl",709],["17bankow.com",709],["kazimierzdolny.pl",709],["vpolshchi.pl",709],["dobreprogramy.pl",[709,710]],["essanews.com",709],["money.pl",709],["autokult.pl",709],["komorkomania.pl",709],["polygamia.pl",709],["autocentrum.pl",709],["homebook.pl",709],["domodi.pl",709],["jastrzabpost.pl",709],["open.fm",709],["gadzetomania.pl",709],["fotoblogia.pl",709],["abczdrowie.pl",709],["parenting.pl",709],["kafeteria.pl",709],["vibez.pl",709],["wakacje.pl",709],["extradom.pl",709],["totalmoney.pl",709],["superauto.pl",709],["nerwica.com",709],["forum.echirurgia.pl",709],["dailywrap.net",709],["pysznosci.pl",709],["genialne.pl",709],["finansowysupermarket.pl",709],["deliciousmagazine.pl",709],["audioteka.com",709],["easygo.pl",709],["so-magazyn.pl",709],["o2.pl",709],["pudelek.pl",709],["benchmark.pl",709],["wp.pl",709],["altibox.dk",711],["altibox.no",711],["talksport.com",712],["zuiderzeemuseum.nl",713],["gota.io",714],["nwzonline.de",715],["wero-wallet.eu",716],["scaleway.com",717],["bistro.sk",718],["spk-schaumburg.de",719],["computerbase.de",720],["wowbiz.ro",721],["observatornews.ro",721],["comdirect.de",722],["metro.co.uk",723]]);
const exceptionsMap = new Map([]);
const hasEntities = true;
const hasAncestors = false;

const collectArgIndices = (hn, map, out) => {
    let argsIndices = map.get(hn);
    if ( argsIndices === undefined ) { return; }
    if ( typeof argsIndices !== 'number' ) {
        for ( const argsIndex of argsIndices ) {
            out.add(argsIndex);
        }
    } else {
        out.add(argsIndices);
    }
};

const indicesFromHostname = (hostname, suffix = '') => {
    const hnParts = hostname.split('.');
    const hnpartslen = hnParts.length;
    if ( hnpartslen === 0 ) { return; }
    for ( let i = 0; i < hnpartslen; i++ ) {
        const hn = `${hnParts.slice(i).join('.')}${suffix}`;
        collectArgIndices(hn, hostnamesMap, todoIndices);
        collectArgIndices(hn, exceptionsMap, tonotdoIndices);
    }
    if ( hasEntities ) {
        const n = hnpartslen - 1;
        for ( let i = 0; i < n; i++ ) {
            for ( let j = n; j > i; j-- ) {
                const en = `${hnParts.slice(i,j).join('.')}.*${suffix}`;
                collectArgIndices(en, hostnamesMap, todoIndices);
                collectArgIndices(en, exceptionsMap, tonotdoIndices);
            }
        }
    }
};

const entries = (( ) => {
    const docloc = document.location;
    const origins = [ docloc.origin ];
    if ( docloc.ancestorOrigins ) {
        origins.push(...docloc.ancestorOrigins);
    }
    return origins.map((origin, i) => {
        const beg = origin.lastIndexOf('://');
        if ( beg === -1 ) { return; }
        const hn = origin.slice(beg+3)
        const end = hn.indexOf(':');
        return { hn: end === -1 ? hn : hn.slice(0, end), i };
    }).filter(a => a !== undefined);
})();
if ( entries.length === 0 ) { return; }

const todoIndices = new Set();
const tonotdoIndices = new Set();

indicesFromHostname(entries[0].hn);
if ( hasAncestors ) {
    for ( const entry of entries ) {
        if ( entry.i === 0 ) { continue; }
        indicesFromHostname(entry.hn, '>>');
    }
}

// Apply scriplets
for ( const i of todoIndices ) {
    if ( tonotdoIndices.has(i) ) { continue; }
    try { trustedClickElement(...argsList[i]); }
    catch { }
}

/******************************************************************************/

// End of local scope
})();

void 0;
