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

// ruleset: ublock-filters

// Important!
// Isolate from global scope

// Start of local scope
(function uBOL_removeNodeText() {

/******************************************************************************/

function removeNodeText(
    nodeName,
    includes,
    ...extraArgs
) {
    replaceNodeTextFn(nodeName, '', '', 'includes', includes || '', ...extraArgs);
}

function replaceNodeTextFn(
    nodeName = '',
    pattern = '',
    replacement = ''
) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('replace-node-text.fn', ...Array.from(arguments));
    const reNodeName = safe.patternToRegex(nodeName, 'i', true);
    const rePattern = safe.patternToRegex(pattern, 'gms');
    const extraArgs = safe.getExtraArgs(Array.from(arguments), 3);
    const reIncludes = extraArgs.includes || extraArgs.condition
        ? safe.patternToRegex(extraArgs.includes || extraArgs.condition, 'ms')
        : null;
    const reExcludes = extraArgs.excludes
        ? safe.patternToRegex(extraArgs.excludes, 'ms')
        : null;
    const stop = (takeRecord = true) => {
        if ( takeRecord ) {
            handleMutations(observer.takeRecords());
        }
        observer.disconnect();
        if ( safe.logLevel > 1 ) {
            safe.uboLog(logPrefix, 'Quitting');
        }
    };
    const textContentFactory = (( ) => {
        const out = { createScript: s => s };
        const { trustedTypes: tt } = self;
        if ( tt instanceof Object ) {
            if ( typeof tt.getPropertyType === 'function' ) {
                if ( tt.getPropertyType('script', 'textContent') === 'TrustedScript' ) {
                    return tt.createPolicy(getRandomTokenFn(), out);
                }
            }
        }
        return out;
    })();
    let sedCount = extraArgs.sedCount || 0;
    const handleNode = node => {
        const before = node.textContent;
        if ( reIncludes ) {
            reIncludes.lastIndex = 0;
            if ( safe.RegExp_test.call(reIncludes, before) === false ) { return true; }
        }
        if ( reExcludes ) {
            reExcludes.lastIndex = 0;
            if ( safe.RegExp_test.call(reExcludes, before) ) { return true; }
        }
        rePattern.lastIndex = 0;
        if ( safe.RegExp_test.call(rePattern, before) === false ) { return true; }
        rePattern.lastIndex = 0;
        const after = pattern !== ''
            ? before.replace(rePattern, replacement)
            : replacement;
        node.textContent = node.nodeName === 'SCRIPT'
            ? textContentFactory.createScript(after)
            : after;
        if ( safe.logLevel > 1 ) {
            safe.uboLog(logPrefix, `Text before:\n${before.trim()}`);
        }
        safe.uboLog(logPrefix, `Text after:\n${after.trim()}`);
        return sedCount === 0 || (sedCount -= 1) !== 0;
    };
    const handleMutations = mutations => {
        for ( const mutation of mutations ) {
            for ( const node of mutation.addedNodes ) {
                if ( reNodeName.test(node.nodeName) === false ) { continue; }
                if ( handleNode(node) ) { continue; }
                stop(false); return;
            }
        }
    };
    const observer = new MutationObserver(handleMutations);
    observer.observe(document, { childList: true, subtree: true });
    if ( document.documentElement ) {
        const treeWalker = document.createTreeWalker(
            document.documentElement,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
        );
        let count = 0;
        for (;;) {
            const node = treeWalker.nextNode();
            count += 1;
            if ( node === null ) { break; }
            if ( reNodeName.test(node.nodeName) === false ) { continue; }
            if ( node === document.currentScript ) { continue; }
            if ( handleNode(node) ) { continue; }
            stop(); break;
        }
        safe.uboLog(logPrefix, `${count} nodes present before installing mutation observer`);
    }
    if ( extraArgs.stay ) { return; }
    runAt(( ) => {
        const quitAfter = extraArgs.quitAfter || 0;
        if ( quitAfter !== 0 ) {
            setTimeout(( ) => { stop(); }, quitAfter);
        } else {
            stop();
        }
    }, 'interactive');
}

function getRandomTokenFn() {
    const safe = safeSelf();
    return safe.String_fromCharCode(Date.now() % 26 + 97) +
        safe.Math_floor(safe.Math_random() * 982451653 + 982451653).toString(36);
}

function runAt(fn, when) {
    const intFromReadyState = state => {
        const targets = {
            'loading': 1, 'asap': 1,
            'interactive': 2, 'end': 2, '2': 2,
            'complete': 3, 'idle': 3, '3': 3,
        };
        const tokens = Array.isArray(state) ? state : [ state ];
        for ( const token of tokens ) {
            const prop = `${token}`;
            if ( Object.hasOwn(targets, prop) === false ) { continue; }
            return targets[prop];
        }
        return 0;
    };
    const runAt = intFromReadyState(when);
    if ( intFromReadyState(document.readyState) >= runAt ) {
        fn(); return;
    }
    const onStateChange = ( ) => {
        if ( intFromReadyState(document.readyState) < runAt ) { return; }
        fn();
        safe.removeEventListener.apply(document, args);
    };
    const safe = safeSelf();
    const args = [ 'readystatechange', onStateChange, { capture: true } ];
    safe.addEventListener.apply(document, args);
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
const argsList = [["script","window,\"fetch\""],["script","offsetParent"],["script","/adblock/i"],["script","location.reload"],["script","adBlockEnabled"],["script","\"Anzeige\""],["script","adserverDomain"],["script","Promise"],["script","/adbl/i"],["script","Reflect"],["script","document.write"],["script","self == top"],["script","exdynsrv"],["script","/delete window|adserverDomain|FingerprintJS/"],["script","delete window"],["script","adsbygoogle"],["script","FingerprintJS"],["script","/h=decodeURIComponent|popundersPerIP/"],["script","/adblock.php"],["script","/adb/i"],["script","/document\\.createElement|\\.banner-in/"],["script","admbenefits"],["script","/\\badblock\\b/"],["script","myreadCookie"],["script","ExoLoader"],["script","/?key.*open/","condition","key"],["script","adblock"],["script","homad"],["script","popUnderUrl"],["script","Adblock"],["script","WebAssembly"],["script","/ABDetected|navigator.brave|fetch/"],["script","/ai_|b2a/"],["script","deblocker"],["script","window.adblockDetector"],["script","DName"],["script","/bypass.php"],["script","htmls"],["script","toast"],["script","AdbModel"],["script","/popup/i"],["script","antiAdBlockerHandler"],["script","/ad\\s?block|adsBlocked|document\\.write\\(unescape\\('|devtool/i"],["script","onerror"],["script","location.assign"],["script","location.href"],["script","/checkAdBlocker|AdblockRegixFinder/"],["script","catch"],["script","/adb_detected|;break;case \\$\\./"],["script","window.open"],["script","/aclib|break;|zoneNativeSett/"],["script","/fetch|popupshow/"],["script","justDetectAdblock"],["script","/FingerprintJS|openPopup/"],["script","DisableDevtool"],["script","popUp"],["script","/adsbygoogle|detectAdBlock/"],["script","onDevToolOpen"],["script","detectAdBlock"],["script","ctrlKey"],["script","/\\);break;case|advert_|POPUNDER_URL|adblock/"],["script","DisplayAcceptableAdIfAdblocked"],["script","adslotFilledByCriteo"],["script","/==undefined.*body/"],["script","/popunder|isAdBlock|admvn.src/i"],["script","/h=decodeURIComponent|\"popundersPerIP\"/"],["script","popMagic"],["script","/popMagic|pop1stp/"],["script","/shown_at|WebAssembly/"],["script",";}}};break;case $."],["script","globalThis;break;case"],["script","{delete window["],["script","wpadmngr.com"],["script","/decodeURIComponent\\(escape|fairAdblock/"],["script","/ai_|googletag|adb/"],["script","ai_adb"],["script","\"v4ac1eiZr0\""],["script","admiral"],["script","'').split(',')[4]"],["script","/\"v4ac1eiZr0\"|\"\"\\)\\.split\\(\",\"\\)\\[4\\]|(\\.localStorage\\)|JSON\\.parse\\(\\w)\\.getItem\\(\"|[\"']_aQS0\\w+[\"']/"],["script","error-report.com"],["script","html-load.com"],["script","KCgpPT57bGV0IGU"],["script","Ad-Shield"],["script","adrecover.com"],["script","/bizx|prebid/"],["script","\"data-sdk\""],["script","_ADX_"],["script","/adbl|RegExp/i"],["script","/WebAssembly|forceunder/"],["script","/isAdBlocked|popUnderUrl/"],["script","/adb|offsetWidth|eval/i"],["script","contextmenu"],["script","/adblock|var Data.*];/"],["script","var Data"],["script","replace"],["style","text-decoration"],["script","/break;case|FingerprintJS/"],["script","push"],["script","AdBlocker"],["script","clicky"],["script","XV"],["script","onload"],["script","Popunder"],["script","charCodeAt"],["script","localStorage"],["script","popunder"],["script","adbl"],["script","googlesyndication"],["script","blockAdBlock"],["script","/downloadJSAtOnload|Object.prototype.toString.call/"],["script","numberPages"],["script","brave"],["script","AreLoaded"],["script","AdblockRegixFinder"],["script","/adScript|adsBlocked/"],["script","serve"],["script","?metric=transit.counter&key=fail_redirect&tags="],["script","/pushAdTag|link_click|getAds/"],["script","/\\', [0-9]{5}\\)\\]\\; \\}/"],["script","/\\\",\\\"clickp\\\"\\:\\\"[0-9]{1,2}\\\"/"],["script","/ConsoleBan|alert|AdBlocker/"],["style","body:not(.ownlist)"],["script","mdpDeblocker"],["script","alert","condition","adblock"],["script","/deblocker|chp_ad/"],["script","await fetch"],["script","AdBlock"],["script","/'.adsbygoogle'|text-danger|warning|Adblock|_0x/"],["script","insertAdjacentHTML"],["script","popUnder"],["script","adb"],["#text","/スポンサーリンク|Sponsored Link|广告/"],["#text","スポンサーリンク"],["#text","スポンサードリンク"],["#text","/\\[vkExUnit_ad area=(after|before)\\]/"],["#text","【広告】"],["#text","関連動画"],["#text","PR:"],["script","leave_recommend"],["#text","/Advertisement/"],["script","navigator.brave"],["script","popundersPerIP"],["script","liedetector"],["script","end_click"],["script","getComputedStyle"],["script","closeAd"],["script","/adconfig/i"],["script","is_antiblock_refresh"],["script","/userAgent|adb|htmls/"],["script","myModal"],["script","open"],["script","app_checkext"],["script","ad blocker"],["script","clientHeight"],["script","Brave"],["script","await"],["script","axios"],["script","/charAt|XMLHttpRequest/"],["script","AdBlockEnabled"],["script","window.location.replace"],["script","egoTab"],["script","/$.*(css|oncontextmenu)/"],["script","/eval.*RegExp/"],["script","wwads"],["script","/\\[\\'push\\'\\]/"],["script","/ads?Block/i"],["script","chkADB"],["script","Symbol.iterator"],["script","ai_cookie"],["script","/innerHTML.*appendChild/"],["script","Exo"],["script","AaDetector"],["script","/window\\[\\'open\\'\\]/"],["script","Error"],["script","/document\\.head\\.appendChild|window\\.open/"],["script","pop1stp"],["script","Number"],["script","NEXT_REDIRECT"],["script","ad-block-activated"],["script","insertBefore"],["script","pop.doEvent"],["script","Ads"],["script","detect"],["script","fetch"],["script","/hasAdblock|detect/"],["script","document.createTextNode"],["script","adsSrc"],["script","/adblock|popunder|openedPop|WebAssembly|wpadmngr/"],["script","/popMagic|nativeads|navigator\\.brave|\\.abk_msg|\\.innerHTML|ad block|manipulation/"],["script","window.warn"],["script","adBlock"],["script","adBlockDetected"],["script","/fetch|adb/i"],["script","location"],["script","showAd"],["script","imgSrc"],["script","document.createElement(\"script\")"],["script","antiAdBlock"],["script","/fairAdblock|popMagic/"],["script","/pop1stp|detectAdBlock/"],["script","aclib.runPop"],["script","mega-enlace.com/ext.php?o="],["script","Popup"],["script","displayAdsV3"],["script","adblocker"],["script","break;case"],["h2","/creeperhost/i"],["script","/interceptClickEvent|onbeforeunload|popMagic|location\\.replace/"],["script","/adserverDomain|\\);break;case /"],["script","initializeInterstitial"],["script","popupBackground"],["script","/h=decodeURIComponent|popundersPerIP|adserverDomain/"],["script","m9-ad-modal"],["script","Anzeige"],["script","blocking"],["script","HTMLAllCollection"],["script","LieDetector"],["script","advads"],["script","document.cookie"],["script","/h=decodeURIComponent|popundersPerIP|window\\.open|\\.createElement/"],["script","/_0x|brave|onerror/"],["script","window.googletag.pubads"],["script","kmtAdsData"],["script","wpadmngr"],["script","navigator.userAgent"],["script","checkAdBlock"],["script","detectedAdblock"],["script","setADBFlag"],["script","/h=decodeURIComponent|popundersPerIP|wpadmngr|popMagic/"],["script","/wpadmngr|adserverDomain/"],["script","/account_ad_blocker|tmaAB/"],["script","ads_block"],["script","/adserverDomain|delete window|FingerprintJS/"],["script","return a.split"],["script","/popundersPerIP|adserverDomain|wpadmngr/"],["script","==\"]"],["script","ads-blocked"],["script","#adbd"],["script","AdBl"],["script","/adblock|Cuba|noadb|popundersPerIP/i"],["script","/adserverDomain|ai_cookie/"],["script","/adsBlocked|\"popundersPerIP\"/"],["script","ab.php"],["script","wpquads_adblocker_check"],["script","__adblocker"],["script","/alert|brave|blocker/i"],["script","/ai_|eval|Google/"],["script","/eval|adb/i"],["script","catcher"],["script","/setADBFlag|cRAds|\\;break\\;case|adManager|const popup/"],["script","/isAdBlockActive|WebAssembly/"],["script","videoList"],["script","freestar"],["script","/admiral/i"],["script","/AdBlock/i"],["script","/andbox|adBlock|data-zone|histats|contextmenu|ConsoleBan/"],["script","closePlayer"],["script","/detect|WebAssembly/"],["script","_0x"],["script","destroyContent"],["script","advanced_ads_check_adblocker"],["script","'hidden'"],["script","/dismissAdBlock|533092QTEErr/"],["script","debugger"],["script","/join\\(\\'\\'\\)/"],["script","/join\\(\\\"\\\"\\)/"],["script","api.dataunlocker.com"],["script","/^Function\\(\\\"/"],["script","vglnk"],["script","/detect|FingerprintJS/"],["script","/RegExp\\(\\'/","condition","RegExp"]];
const hostnamesMap = new Map([["www.youtube.com",0],["poophq.com",1],["veev.to",1],["faqwiki.*",2],["snapwordz.com",2],["toolxox.com",2],["rl6mans.com",2],["nontonx.com",3],["pandadoc.com",4],["web.de",5],["skidrowreloaded.com",[6,17]],["1337x.*",[6,17]],["1stream.eu",6],["4kwebplay.xyz",6],["alldownplay.xyz",6],["anime4i.vip",6],["antennasports.ru",6],["boxingstream.me",6],["buffstreams.app",6],["claplivehdplay.ru",[6,211]],["cracksports.me",[6,16]],["cricstream.me",6],["cricstreams.re",[6,16]],["dartsstreams.com",6],["eurekaddl.baby",6],["euro2024direct.ru",6],["ext.to",6],["extrem-down.*",6],["extreme-down.*",6],["eztv.*",6],["eztvx.to",6],["f1box.me",6],["flix-wave.*",6],["flixrave.me",6],["golfstreams.me",6],["hikaritv.xyz",6],["ianimes.one",6],["jointexploit.net",[6,17]],["kenitv.me",[6,16]],["lewblivehdplay.ru",[6,211]],["mediacast.click",6],["mixdrop.*",[6,17]],["mlbbite.net",6],["mlbstreams.ai",6],["motogpstream.me",6],["nbabox.me",6],["nflbox.me",6],["nhlbox.me",6],["playcast.click",6],["qatarstreams.me",[6,16]],["qqwebplay.xyz",[6,211]],["rnbastreams.com",6],["rugbystreams.me",6],["sanet.*",6],["socceronline.me",6],["soccerworldcup.me",[6,16]],["sportshd.*",6],["sportzonline.si",6],["streamed.su",6],["sushiscan.net",6],["topstreams.info",6],["totalsportek.to",6],["tvableon.me",[6,16]],["vecloud.eu",6],["vibestreams.*",6],["vipstand.pm",6],["worldsports.me",6],["x1337x.*",6],["wawacity.*",6],["720pstream.*",[6,69]],["embedsports.me",[6,97]],["embedstream.me",[6,16,17,69,97]],["jumbtv.com",[6,97]],["reliabletv.me",[6,97]],["topembed.pw",[6,71,211]],["crackstreamer.net",6],["methstreamer.com",6],["vidsrc.*",[6,16,69]],["vidco.pro",[6,69]],["freestreams-live.*>>",6],["moviepilot.de",[7,61]],["userupload.*",8],["cinedesi.in",8],["intro-hd.net",8],["monacomatin.mc",8],["nodo313.net",8],["mhdtvsports.*",[8,33]],["hesgoal-tv.io",8],["hesgoal-vip.io",8],["earn.punjabworks.com",8],["mahajobwala.in",8],["solewe.com",8],["panel.play.hosting",8],["total-sportek.to",8],["hesgoal-vip.to",8],["shoot-yalla.me",8],["shoot-yalla-tv.live",8],["pahe.*",[9,17,71]],["soap2day.*",9],["yts.mx",10],["hqq.*",11],["waaw.*",11],["pixhost.*",12],["vipbox.*",13],["telerium.*",14],["apex2nova.com",14],["hoca5.com",14],["germancarforum.com",15],["cybercityhelp.in",15],["innateblogger.com",15],["omeuemprego.online",15],["viprow.*",[16,17,69]],["bluemediadownload.*",16],["bluemediafile.*",16],["bluemedialink.*",16],["bluemediastorage.*",16],["bluemediaurls.*",16],["urlbluemedia.*",16],["bowfile.com",16],["cloudvideo.tv",[16,69]],["cloudvideotv.*",[16,69]],["coloredmanga.com",16],["exeo.app",16],["hiphopa.net",[16,17]],["megaup.net",16],["olympicstreams.co",[16,69]],["tv247.us",[16,17]],["uploadhaven.com",16],["userscloud.com",[16,69]],["streamnoads.com",[16,17,69,89]],["mlbbox.me",16],["vikingf1le.us.to",16],["neodrive.xyz",16],["mdfx9dc8n.net",17],["mdzsmutpcvykb.net",17],["mixdrop21.net",17],["mixdropjmk.pw",17],["123-movies.*",17],["123movieshd.*",17],["123movieshub.*",17],["123moviesme.*",17],["1337x.ninjaproxy1.com",17],["141jav.com",17],["141tube.com",17],["1bit.space",17],["1bitspace.com",17],["1stream.*",17],["1tamilmv.*",17],["2ddl.*",17],["2umovies.*",17],["3dporndude.com",17],["3hiidude.*",17],["4archive.org",17],["4horlover.com",17],["4stream.*",17],["560pmovie.com",17],["5movies.*",17],["7hitmovies.*",17],["85videos.com",17],["9xmovie.*",17],["aagmaal.*",[17,69]],["acefile.co",17],["actusports.eu",17],["adblockeronstape.*",[17,89]],["adblockeronstreamtape.*",17],["adblockplustape.*",[17,89]],["adblockstreamtape.*",[17,89]],["adblockstrtape.*",[17,89]],["adblockstrtech.*",[17,89]],["adblocktape.*",[17,89]],["adclickersbot.com",17],["adcorto.*",17],["adricami.com",17],["adslink.pw",17],["adultstvlive.com",17],["adz7short.space",17],["aeblender.com",17],["affordwonder.net",17],["ahdafnews.blogspot.com",17],["aiblog.tv",[17,72]],["ak47sports.com",17],["akuma.moe",17],["alexsports.*",17],["alexsportss.*",17],["alexsportz.*",17],["allplayer.tk",17],["amateurblog.tv",[17,72]],["androidadult.com",[17,237]],["anhsexjav.xyz",17],["anidl.org",17],["anime-loads.org",17],["animeblkom.net",17],["animefire.plus",17],["animelek.me",17],["animepahe.*",17],["animesanka.*",17],["animesorionvip.net",17],["animespire.net",17],["animestotais.xyz",17],["animeyt.es",17],["animixplay.*",17],["aniplay.*",17],["anroll.net",17],["antiadtape.*",[17,89]],["anymoviess.xyz",17],["aotonline.org",17],["asenshu.com",17],["asialiveaction.com",17],["asianclipdedhd.net",17],["asianclub.*",17],["ask4movie.*",17],["askim-bg.com",17],["asumsikedaishop.com",17],["atomixhq.*",[17,69]],["atomohd.*",17],["avcrempie.com",17],["avseesee.com",17],["gettapeads.com",[17,89]],["bajarjuegospcgratis.com",17],["balkanteka.net",17],["beinmatch.*",[17,25]],["belowporn.com",17],["bestgirlsexy.com",17],["bestnhl.com",17],["bestporncomix.com",17],["bhaai.*",17],["bigwarp.*",17],["bikinbayi.com",17],["bikinitryon.net",17],["birdurls.com",17],["bitsearch.to",17],["blackcockadventure.com",17],["blackcockchurch.org",17],["blackporncrazy.com",17],["blizzboygames.net",17],["blizzpaste.com",17],["blkom.com",17],["blog-peliculas.com",17],["blogtrabalhista.com",17],["blurayufr.*",17],["bobsvagene.club",17],["bokep.im",17],["bokep.top",17],["boyfuck.me",17],["brilian-news.id",17],["brupload.net",17],["buffstreams.*",17],["buzter.xyz",17],["caitlin.top",17],["camchickscaps.com",17],["camgirls.casa",17],["canalesportivo.*",17],["cashurl.in",17],["ccurl.net",[17,69]],["cgpelis.net",17],["charexempire.com",17],["clickndownload.*",17],["clicknupload.*",[17,71]],["clik.pw",17],["coin-free.com",[17,37]],["coins100s.fun",17],["comohoy.com",17],["compucalitv.com",17],["coolcast2.com",17],["cordneutral.net",17],["coreradio.online",17],["cosplaytab.com",17],["countylocalnews.com",17],["cpmlink.net",17],["crackstreamshd.click",17],["crespomods.com",17],["crisanimex.com",17],["crunchyscan.fr",17],["cuevana3.fan",17],["cuevana3hd.com",17],["cumception.com",17],["cutpaid.com",17],["daddylive.*",[17,69,209]],["daddylivehd.*",[17,69]],["dailyuploads.net",17],["datawav.club",17],["daughtertraining.com",17],["ddrmovies.*",17],["deepgoretube.site",17],["deltabit.co",17],["deporte-libre.top",17],["depvailon.com",17],["derleta.com",17],["desiremovies.*",17],["desivdo.com",17],["desixx.net",17],["detikkebumen.com",17],["deutschepornos.me",17],["devlib.*",17],["diasoft.xyz",17],["directupload.net",17],["divxtotal.*",17],["divxtotal1.*",17],["dixva.com",17],["dlhd.*",[17,209]],["doctormalay.com",17],["dofusports.xyz",17],["doods.cam",17],["doodskin.lat",17],["downloadrips.com",17],["downvod.com",17],["dphunters.mom",17],["dragontranslation.com",17],["dvdfullestrenos.com",17],["dvdplay.*",[17,69]],["dx-tv.com",[17,33]],["ebookbb.com",17],["ebookhunter.net",17],["egyanime.com",17],["egygost.com",17],["ekasiwap.com",17],["electro-torrent.pl",17],["elixx.*",17],["enjoy4k.*",17],["eplayer.click",17],["erovoice.us",17],["eroxxx.us",17],["estrenosdoramas.net",17],["estrenosflix.*",17],["estrenosflux.*",17],["estrenosgo.*",17],["everia.club",17],["everythinginherenet.blogspot.com",17],["extratorrent.st",17],["extremotvplay.com",17],["f1stream.*",17],["fapinporn.com",17],["fapptime.com",17],["fastreams.live",17],["faucethero.com",17],["favoyeurtube.net",17],["fbstream.*",17],["fc2db.com",17],["femdom-joi.com",17],["fenixsite.net",17],["file4go.*",17],["filegram.to",[17,67,72]],["fileone.tv",17],["film1k.com",17],["filmeonline2023.net",17],["filmesonlinex.org",17],["filmesonlinexhd.biz",[17,69]],["filmisub.cc",17],["filmovitica.com",17],["filmymaza.blogspot.com",17],["filmyzilla.*",[17,69]],["filthy.family",17],["findav.*",17],["findporn.*",17],["flickzap.com",17],["flixmaza.*",17],["flizmovies.*",17],["flostreams.xyz",17],["flyfaucet.com",17],["footyhunter.lol",17],["forex-trnd.com",17],["forumchat.club",17],["forumlovers.club",17],["freeomovie.co.in",17],["freeomovie.to",17],["freeporncomic.net",17],["freepornhdonlinegay.com",17],["freeproxy.io",17],["freeshot.live",17],["freetvsports.*",17],["freeuse.me",17],["freeusexporn.com",17],["fsharetv.cc",17],["fsicomics.com",17],["fullymaza.*",17],["g-porno.com",17],["g3g.*",17],["galinhasamurai.com",17],["gamepcfull.com",17],["gamesmountain.com",17],["gamesrepacks.com",17],["gamingguru.fr",17],["gamovideo.com",17],["garota.cf",17],["gaydelicious.com",17],["gaypornhdfree.com",17],["gaypornhot.com",17],["gaypornmasters.com",17],["gaysex69.net",17],["gemstreams.com",17],["get-to.link",17],["girlscanner.org",17],["giurgiuveanul.ro",17],["gledajcrtace.xyz",17],["gocast2.com",17],["gomo.to",17],["gostosa.cf",17],["gotxx.*",17],["grantorrent.*",17],["gratispaste.com",17],["gravureblog.tv",[17,72]],["gupload.xyz",17],["haho.moe",17],["hayhd.net",17],["hdmoviesfair.*",[17,69]],["hdmoviesflix.*",17],["hdpornflix.com",17],["hdsaprevodom.com",17],["hdstreamss.club",17],["hentaiporno.xxx",17],["hentais.tube",17],["hentaistream.co",17],["hentaitk.net",17],["hentaitube.online",17],["hentaiworld.tv",17],["hesgoal.tv",17],["hexupload.net",17],["hhkungfu.tv",17],["highlanderhelp.com",17],["hiidudemoviez.*",17],["hindimovies.to",[17,69]],["hindimoviestv.com",17],["hiperdex.com",17],["hispasexy.org",17],["hitprn.com",17],["hivflix.me",17],["hoca4u.com",17],["hollymoviehd.cc",17],["hoodsite.com",17],["hopepaste.download",17],["hornylips.com",17],["hotgranny.live",17],["hotmama.live",17],["hqcelebcorner.net",17],["huren.best",17],["hwnaturkya.com",[17,69]],["hxfile.co",[17,69]],["igfap.com",17],["iklandb.com",17],["illink.net",17],["imgsen.*",17],["imgsex.xyz",17],["imgsto.*",17],["imgtraffic.com",17],["imx.to",17],["incest.*",17],["incestflix.*",17],["influencersgonewild.org",17],["infosgj.free.fr",17],["investnewsbrazil.com",17],["itdmusics.com",17],["itopmusic.*",17],["itsuseful.site",17],["itunesfre.com",17],["iwatchfriendsonline.net",[17,143]],["japangaysex.com",17],["jav-fun.cc",17],["jav-noni.cc",17],["javboys.tv",17],["javcl.com",17],["jav-coco.com",17],["javhay.net",17],["javhoho.com",17],["javhun.com",17],["javleak.com",17],["javmost.*",17],["javporn.best",17],["javsek.net",17],["javsex.to",17],["javtiful.com",[17,19]],["jimdofree.com",17],["jiofiles.org",17],["jorpetz.com",17],["jp-films.com",17],["jpop80ss3.blogspot.com",17],["jpopsingles.eu",[17,187]],["justfullporn.net",17],["kantotflix.net",17],["kaplog.com",17],["keeplinks.*",17],["keepvid.*",17],["keralahd.*",17],["keralatvbox.com",17],["khatrimazaful.*",17],["khatrimazafull.*",[17,72]],["kickassanimes.io",17],["kimochi.info",17],["kimochi.tv",17],["kinemania.tv",17],["kissasian.*",17],["kolnovel.site",17],["koltry.life",17],["konstantinova.net",17],["koora-online.live",17],["kunmanga.com",17],["kwithsub.com",17],["lat69.me",17],["latinblog.tv",[17,72]],["latinomegahd.net",17],["leechall.*",17],["leechpremium.link",17],["legendas.dev",17],["legendei.net",17],["lighterlegend.com",17],["linclik.com",17],["linkebr.com",17],["linkrex.net",17],["linkshorts.*",17],["lulu.st",17],["lulustream.com",[17,71]],["lulustream.live",17],["luluvdo.com",17],["luluvdoo.com",17],["mangaweb.xyz",17],["mangoporn.net",17],["mangovideo.*",17],["manhwahentai.me",17],["masahub.com",17],["masahub.net",17],["masaporn.*",17],["maturegrannyfuck.com",17],["mdy48tn97.com",17],["mediapemersatubangsa.com",17],["mega-mkv.com",17],["megapastes.com",17],["megapornpics.com",17],["messitv.net",17],["meusanimes.net",17],["mexa.sh",17],["milfmoza.com",17],["milfnut.*",17],["milfzr.com",17],["millionscast.com",17],["mimaletamusical.blogspot.com",17],["miniurl.*",17],["mirrorace.*",17],["mitly.us",17],["mixdroop.*",17],["mixixxx000000.cyou",17],["mixixxx696969.cyou",17],["mkv-pastes.com",17],["mkvcage.*",17],["mlbstream.*",17],["mlsbd.*",17],["mmsbee.*",17],["monaskuliner.ac.id",17],["moredesi.com",17],["motogpstream.*",17],["movgotv.net",17],["movi.pk",17],["movieplex.*",17],["movierulzlink.*",17],["movies123.*",17],["moviesflix.*",17],["moviesmeta.*",17],["moviesmod.com.pl",17],["moviessources.*",17],["moviesverse.*",17],["movieswbb.com",17],["moviewatch.com.pk",17],["moviezwaphd.*",17],["mp4upload.com",17],["mrskin.live",17],["mrunblock.*",17],["multicanaistv.com",17],["mundowuxia.com",17],["multicanais.*",17],["myeasymusic.ir",17],["myonvideo.com",17],["myyouporn.com",17],["mzansifun.com",17],["narutoget.info",17],["naughtypiss.com",17],["nbastream.*",17],["nekopoi.*",[17,72]],["nerdiess.com",17],["netfuck.net",17],["new-fs.eu",17],["newmovierulz.*",17],["newtorrentgame.com",17],["neymartv.net",17],["nflstream.*",17],["nflstreams.me",17],["nhlstream.*",17],["nicekkk.com",17],["nicesss.com",17],["nlegs.com",17],["noblocktape.*",[17,89]],["nocensor.*",17],["noni-jav.com",17],["notformembersonly.com",17],["novamovie.net",17],["novelpdf.xyz",17],["novelssites.com",[17,69]],["novelup.top",17],["nsfwr34.com",17],["nu6i-bg-net.com",17],["nudebabesin3d.com",17],["nzbstars.com",17],["o2tvseries.com",17],["ohjav.com",17],["ojearnovelas.com",17],["okanime.xyz",17],["olweb.tv",17],["on9.stream",17],["onepiece-mangaonline.com",17],["onifile.com",17],["onionstream.live",17],["onlinesaprevodom.net",17],["onlyfams.*",17],["onlyfullporn.video",17],["onplustv.live",17],["originporn.com",17],["ouo.*",17],["ovagames.com",17],["palimas.org",17],["password69.com",17],["pastemytxt.com",17],["payskip.org",17],["pctfenix.*",[17,69]],["pctnew.*",[17,69]],["peeplink.in",17],["peliculas24.*",17],["peliculasmx.net",17],["pelisflix20.*",17],["pelisplus.*",17],["pencarian.link",17],["pendidikandasar.net",17],["pervertgirlsvideos.com",17],["pervyvideos.com",17],["phim12h.com",17],["picdollar.com",17],["picsxxxporn.com",17],["pinayscandalz.com",17],["pinkueiga.net",17],["piratebay.*",17],["piratefast.xyz",17],["piratehaven.xyz",17],["pirateiro.com",17],["playtube.co.za",17],["plugintorrent.com",17],["plyjam.*",17],["plylive.*",17],["plyvdo.*",17],["pmvzone.com",17],["porndish.com",17],["pornez.net",17],["pornfetishbdsm.com",17],["pornfits.com",17],["pornhd720p.com",17],["pornhoarder.*",[17,230]],["pornobr.club",17],["pornobr.ninja",17],["pornodominicano.net",17],["pornofaps.com",17],["pornoflux.com",17],["pornotorrent.com.br",17],["pornredit.com",17],["pornstarsyfamosas.es",17],["pornstreams.co",17],["porntn.com",17],["pornxbit.com",17],["pornxday.com",17],["portaldasnovinhas.shop",17],["portugues-fcr.blogspot.com",17],["poseyoung.com",17],["pover.org",17],["prbay.*",17],["projectfreetv.*",17],["proxybit.*",17],["proxyninja.org",17],["psarips.*",17],["pubfilmz.com",17],["publicsexamateurs.com",17],["punanihub.com",17],["pxxbay.com",17],["r18.best",17],["racaty.*",17],["ragnaru.net",17],["rapbeh.net",17],["rapelust.com",17],["rapload.org",17],["read-onepiece.net",17],["readhunters.xyz",17],["remaxhd.*",17],["reshare.pm",17],["retro-fucking.com",17],["retrotv.org",17],["rintor.*",17],["rnbxclusive.*",17],["rnbxclusive0.*",17],["rnbxclusive1.*",17],["robaldowns.com",17],["rockdilla.com",17],["rojadirecta.*",17],["rojadirectaenvivo.*",17],["rojitadirecta.blogspot.com",17],["romancetv.site",17],["rsoccerlink.site",17],["rugbystreams.*",17],["rule34.club",17],["rule34hentai.net",17],["rumahbokep-id.com",17],["sadisflix.*",17],["safego.cc",17],["safetxt.*",17],["sakurafile.com",17],["samax63.lol",17],["satoshi-win.xyz",17],["savefiles.com",[17,67]],["scat.gold",17],["scatfap.com",17],["scatkings.com",17],["serie-turche.com",17],["serijefilmovi.com",17],["sexcomics.me",17],["sexdicted.com",17],["sexgay18.com",17],["sexiezpix.com",17],["sexofilm.co",17],["sextgem.com",17],["sextubebbw.com",17],["sgpics.net",17],["shadowrangers.*",17],["shadowrangers.live",17],["shahee4u.cam",17],["shahi4u.*",17],["shahid4u1.*",17],["shahid4uu.*",17],["shahiid-anime.net",17],["shavetape.*",17],["shemale6.com",17],["shid4u.*",17],["shinden.pl",17],["short.es",17],["shortearn.*",17],["shorten.*",17],["shorttey.*",17],["shortzzy.*",17],["showmanga.blog.fc2.com",17],["shrt10.com",17],["sideplusleaks.net",17],["silverblog.tv",[17,72]],["silverpic.com",17],["sinhalasub.life",17],["sinsitio.site",17],["sinvida.me",17],["skidrowcpy.com",17],["skymovieshd.*",17],["slut.mom",17],["smallencode.me",17],["smoner.com",17],["smplace.com",17],["soccerinhd.com",[17,69]],["socceron.name",17],["socceronline.*",[17,69]],["socialblog.tv",[17,72]],["softairbay.com",17],["softarchive.*",17],["sokobj.com",17],["songsio.com",17],["souexatasmais.com",17],["sportbar.live",17],["sports-stream.*",17],["sportstream1.cfd",17],["sporttuna.*",17],["sporttunatv.*",17],["srt.am",17],["srts.me",17],["sshhaa.*",17],["stapadblockuser.*",[17,89]],["stape.*",[17,89]],["stapewithadblock.*",17],["starblog.tv",[17,72]],["starmusiq.*",17],["stbemuiptv.com",17],["stockingfetishvideo.com",17],["strcloud.*",[17,89]],["stream.crichd.vip",17],["stream.lc",17],["stream25.xyz",17],["streamadblocker.*",[17,69,89]],["streamadblockplus.*",[17,89]],["streambee.to",17],["streambucket.net",17],["streamcdn.*",17],["streamcenter.pro",17],["streamers.watch",17],["streamgo.to",17],["streamhub.*",17],["streamingclic.com",17],["streamkiste.tv",17],["streamoupload.xyz",17],["streamservicehd.click",17],["streamsport.*",17],["streamta.*",[17,89]],["streamtape.*",[17,72,89]],["streamtapeadblockuser.*",[17,89]],["streamvid.net",[17,26]],["strikeout.*",[17,71]],["strtape.*",[17,89]],["strtapeadblock.*",[17,89]],["strtapeadblocker.*",[17,89]],["strtapewithadblock.*",17],["strtpe.*",[17,89]],["subtitleporn.com",17],["subtitles.cam",17],["suicidepics.com",17],["supertelevisionhd.com",17],["supexfeeds.com",17],["swatchseries.*",17],["swiftload.io",17],["swipebreed.net",17],["swzz.xyz",17],["sxnaar.com",17],["tabooflix.*",17],["taboosex.club",17],["tapeantiads.com",[17,89]],["tapeblocker.com",[17,89]],["tapenoads.com",[17,89]],["tapewithadblock.org",[17,89,271]],["teamos.xyz",17],["teen-wave.com",17],["teenporncrazy.com",17],["telegramgroups.xyz",17],["telenovelasweb.com",17],["tennisstreams.*",17],["tensei-shitara-slime-datta-ken.com",17],["tfp.is",17],["tgo-tv.co",[17,69]],["thaihotmodels.com",17],["theblueclit.com",17],["thebussybandit.com",17],["thedaddy.*",[17,209]],["thelastdisaster.vip",17],["themoviesflix.*",17],["thepiratebay.*",17],["thepiratebay0.org",17],["thepiratebay10.info",17],["thesexcloud.com",17],["thothub.today",17],["tightsexteens.com",17],["tlnovelas.net",17],["tmearn.*",17],["tojav.net",17],["tokusatsuindo.com",17],["toonanime.*",17],["top16.net",17],["topdrama.net",17],["topvideosgay.com",17],["torlock.*",17],["tormalayalam.*",17],["torrage.info",17],["torrents.vip",17],["torrentz2eu.*",17],["torrsexvid.com",17],["tpb-proxy.xyz",17],["trannyteca.com",17],["trendytalker.com",17],["tuktukcinma.com",17],["tumanga.net",17],["turbogvideos.com",17],["turboimagehost.com",17],["turbovid.me",17],["turkishseriestv.org",17],["turksub24.net",17],["tutele.sx",17],["tutelehd.*",17],["tvglobe.me",17],["tvpclive.com",17],["tvply.*",17],["tvs-widget.com",17],["tvseries.video",17],["u4m.*",17],["ucptt.com",17],["ufaucet.online",17],["ufcfight.online",17],["ufcstream.*",17],["ultrahorny.com",17],["ultraten.net",17],["unblocknow.*",17],["unblockweb.me",17],["underhentai.net",17],["uniqueten.net",17],["uns.bio",17],["upbaam.com",17],["uploadbuzz.*",17],["upstream.to",17],["usagoals.*",17],["ustream.to",17],["valhallas.click",[17,142]],["valeriabelen.com",17],["verdragonball.online",17],["vexmoviex.*",17],["vfxmed.com",17],["vidclouds.*",17],["video.az",17],["videostreaming.rocks",17],["videowood.tv",17],["vidlox.*",17],["vidorg.net",17],["vidtapes.com",17],["vidz7.com",17],["vikistream.com",17],["vinovo.to",17],["vipboxtv.*",[17,69]],["vipleague.*",[17,233]],["virpe.cc",17],["visifilmai.org",17],["viveseries.com",17],["vladrustov.sx",17],["volokit2.com",[17,209]],["vstorrent.org",17],["w-hentai.com",17],["watch-series.*",17],["watchbrooklynnine-nine.com",17],["watchelementaryonline.com",17],["watchjavidol.com",17],["watchkobestreams.info",17],["watchlostonline.net",17],["watchmodernfamilyonline.com",17],["watchmonkonline.com",17],["watchrulesofengagementonline.com",17],["watchseries.*",17],["webcamrips.com",17],["wincest.xyz",17],["wolverdon.fun",17],["wordcounter.icu",17],["worldmovies.store",17],["worldstreams.click",17],["wpdeployit.com",17],["wqstreams.tk",17],["wwwsct.com",17],["xanimeporn.com",17],["xblog.tv",[17,72]],["xclusivejams.*",17],["xmoviesforyou.*",17],["xn--verseriesespaollatino-obc.online",17],["xpornium.net",17],["xsober.com",17],["xvip.lat",17],["xxgasm.com",17],["xxvideoss.org",17],["xxx18.uno",17],["xxxdominicana.com",17],["xxxfree.watch",17],["xxxmax.net",17],["xxxwebdlxxx.top",17],["xxxxvideo.uno",17],["yabai.si",17],["yeshd.net",17],["youdbox.*",17],["youjax.com",17],["yourdailypornvideos.ws",17],["yourupload.com",17],["youswear.com",17],["ytmp3eu.*",17],["yts-subs.*",17],["yts.*",17],["ytstv.me",17],["yumeost.net",17],["zerion.cc",17],["zerocoin.top",17],["zitss.xyz",17],["zooqle.*",17],["zpaste.net",17],["fastreams.com",17],["sky-sports.store",17],["streamsoccer.site",17],["tntsports.store",17],["wowstreams.co",17],["dutchycorp.*",18],["faucet.ovh",18],["mmacore.tv",19],["nxbrew.net",19],["brawlify.com",19],["oko.sh",20],["variety.com",[21,79]],["gameskinny.com",21],["deadline.com",[21,79]],["mlive.com",[21,79]],["washingtonpost.com",22],["gosexpod.com",23],["sexo5k.com",24],["truyen-hentai.com",24],["theshedend.com",26],["zeroupload.com",26],["securenetsystems.net",26],["miniwebtool.com",26],["bchtechnologies.com",26],["eracast.cc",26],["flatai.org",26],["leeapk.com",26],["spiegel.de",27],["jacquieetmichel.net",28],["hausbau-forum.de",29],["althub.club",29],["kiemlua.com",29],["doujindesu.*",30],["atlasstudiousa.com",30],["51bonusrummy.in",[30,72]],["tea-coffee.net",31],["spatsify.com",31],["newedutopics.com",31],["getviralreach.in",31],["edukaroo.com",31],["funkeypagali.com",31],["careersides.com",31],["nayisahara.com",31],["wikifilmia.com",31],["infinityskull.com",31],["viewmyknowledge.com",31],["iisfvirtual.in",31],["starxinvestor.com",31],["jkssbalerts.com",31],["imagereviser.com",32],["veganab.co",33],["camdigest.com",33],["learnmany.in",33],["amanguides.com",[33,39]],["highkeyfinance.com",[33,39]],["appkamods.com",33],["techacode.com",33],["djqunjab.in",33],["downfile.site",33],["expertvn.com",33],["trangchu.news",33],["shemaleraw.com",33],["thecustomrom.com",33],["nulleb.com",33],["snlookup.com",33],["bingotingo.com",33],["ghior.com",33],["3dmili.com",33],["karanpc.com",33],["plc247.com",33],["apkdelisi.net",33],["freepasses.org",33],["poplinks.*",[33,43]],["tomarnarede.pt",33],["basketballbuzz.ca",33],["dribbblegraphics.com",33],["kemiox.com",33],["teksnologi.com",33],["bharathwick.com",33],["descargaspcpro.net",33],["rt3dmodels.com",33],["plc4me.com",33],["blisseyhusbands.com",33],["mhdsports.*",33],["mhdsportstv.*",33],["mhdtvworld.*",33],["mhdtvmax.*",33],["mhdstream.*",33],["madaradex.org",33],["trigonevo.com",33],["franceprefecture.fr",33],["jazbaat.in",33],["aipebel.com",33],["audiotools.blog",33],["embdproxy.xyz",33],["labgame.io",[34,35]],["kenzo-flowertag.com",36],["mdn.lol",36],["btcbitco.in",37],["btcsatoshi.net",37],["cempakajaya.com",37],["crypto4yu.com",37],["manofadan.com",37],["readbitcoin.org",37],["wiour.com",37],["tremamnon.com",37],["bitsmagic.fun",37],["ourcoincash.xyz",37],["aylink.co",38],["sugarona.com",39],["nishankhatri.xyz",39],["cety.app",40],["exe-urls.com",40],["exego.app",40],["cutlink.net",40],["cutyurls.com",40],["cutty.app",40],["cutnet.net",40],["jixo.online",40],["tinys.click",41],["loan.creditsgoal.com",41],["rupyaworld.com",41],["vahantoday.com",41],["techawaaz.in",41],["loan.bgmi32bitapk.in",41],["formyanime.com",41],["gsm-solution.com",41],["h-donghua.com",41],["hindisubbedacademy.com",41],["hm4tech.info",41],["mydverse.*",41],["panelprograms.blogspot.com",41],["ripexbooster.xyz",41],["serial4.com",41],["tutorgaming.com",41],["everydaytechvams.com",41],["dipsnp.com",41],["cccam4sat.com",41],["diendancauduong.com",41],["zeemoontv-24.blogspot.com",41],["stitichsports.com",41],["aiimgvlog.fun",42],["appsbull.com",43],["diudemy.com",43],["maqal360.com",43],["androjungle.com",43],["bookszone.in",43],["shortix.co",43],["makefreecallsonline.com",43],["msonglyrics.com",43],["app-sorteos.com",43],["bokugents.com",43],["client.pylexnodes.net",43],["btvplus.bg",43],["listar-mc.net",43],["blog24.me",[44,45]],["coingraph.us",46],["impact24.us",46],["iconicblogger.com",47],["auto-crypto.click",47],["tpi.li",48],["oii.la",[48,71]],["shrinke.*",49],["shrinkme.*",49],["smutty.com",49],["e-sushi.fr",49],["gayforfans.com",49],["freeadultcomix.com",49],["down.dataaps.com",49],["filmweb.pl",[49,182]],["livecamrips.*",49],["safetxt.net",49],["filespayouts.com",49],["atglinks.com",50],["kbconlinegame.com",51],["hamrojaagir.com",51],["odijob.com",51],["stfly.biz",52],["airevue.net",52],["atravan.net",52],["simana.online",53],["fooak.com",53],["joktop.com",53],["evernia.site",53],["falpus.com",53],["rfiql.com",54],["gujjukhabar.in",54],["smartfeecalculator.com",54],["djxmaza.in",54],["thecubexguide.com",54],["jytechs.in",54],["financacerta.com",55],["encurtads.net",55],["mastkhabre.com",56],["weshare.is",57],["vi-music.app",58],["instanders.app",58],["rokni.xyz",58],["keedabankingnews.com",58],["pig69.com",58],["cosplay18.pics",[58,258]],["3dsfree.org",59],["up4load.com",60],["alpin.de",61],["boersennews.de",61],["chefkoch.de",61],["chip.de",61],["clever-tanken.de",61],["desired.de",61],["donnerwetter.de",61],["fanfiktion.de",61],["focus.de",61],["formel1.de",61],["frustfrei-lernen.de",61],["gewinnspiele.tv",61],["giga.de",61],["gut-erklaert.de",61],["kino.de",61],["messen.de",61],["nickles.de",61],["nordbayern.de",61],["spielfilm.de",61],["teltarif.de",[61,62]],["unsere-helden.com",61],["weltfussball.at",61],["watson.de",61],["mactechnews.de",61],["sport1.de",61],["welt.de",61],["sport.de",61],["allthingsvegas.com",63],["100percentfedup.com",63],["beforeitsnews.com",63],["concomber.com",63],["conservativefiringline.com",63],["dailylol.com",63],["funnyand.com",63],["letocard.fr",63],["mamieastuce.com",63],["meilleurpronostic.fr",63],["patriotnationpress.com",63],["toptenz.net",63],["vitamiiin.com",63],["writerscafe.org",63],["populist.press",63],["dailytruthreport.com",63],["livinggospeldaily.com",63],["first-names-meanings.com",63],["welovetrump.com",63],["thehayride.com",63],["thelibertydaily.com",63],["thepoke.co.uk",63],["thepolitistick.com",63],["theblacksphere.net",63],["shark-tank.com",63],["naturalblaze.com",63],["greatamericanrepublic.com",63],["dailysurge.com",63],["truthlion.com",63],["flagandcross.com",63],["westword.com",63],["republicbrief.com",63],["freedomfirstnetwork.com",63],["phoenixnewtimes.com",63],["designbump.com",63],["clashdaily.com",63],["madworldnews.com",63],["reviveusa.com",63],["sonsoflibertymedia.com",63],["thedesigninspiration.com",63],["videogamesblogger.com",63],["protrumpnews.com",63],["thepalmierireport.com",63],["kresy.pl",63],["thepatriotjournal.com",63],["thegatewaypundit.com",63],["wltreport.com",63],["miaminewtimes.com",63],["politicalsignal.com",63],["rightwingnews.com",63],["bigleaguepolitics.com",63],["comicallyincorrect.com",63],["upornia.com",64],["pillowcase.su",65],["akaihentai.com",66],["cine-calidad.*",66],["fastpic.org",[66,72]],["forums.socialmediagirls.com",[66,72]],["monoschino2.com",66],["veryfreeporn.com",66],["pornoenspanish.es",66],["theporngod.com",66],["besthdgayporn.com",67],["drivenime.com",67],["erothots1.com",67],["javup.org",67],["shemaleup.net",67],["transflix.net",67],["worthcrete.com",67],["hentaihere.com",68],["player.smashy.stream",68],["player.smashystream.com",68],["123movies.*",69],["123moviesla.*",69],["123movieweb.*",69],["2embed.*",69],["9xmovies.*",69],["adsh.cc",69],["adshort.*",69],["afilmyhouse.blogspot.com",69],["ak.sv",69],["allmovieshub.*",69],["api.webs.moe",69],["apkmody.io",69],["asianplay.*",69],["atishmkv.*",69],["backfirstwo.site",69],["bflix.*",69],["crazyblog.in",69],["cricstream.*",69],["crictime.*",69],["cuervotv.me",69],["divicast.com",69],["dood.*",[69,188]],["dooood.*",[69,188]],["embed.meomeo.pw",69],["extramovies.*",69],["faselhd.*",69],["faselhds.*",69],["filemoon.*",69],["filmeserialeonline.org",69],["filmy.*",69],["filmyhit.*",69],["filmywap.*",69],["flexyhit.com",69],["fmovies.*",69],["foreverwallpapers.com",69],["french-streams.cc",69],["gdplayer.*",69],["goku.*",69],["gomovies.*",69],["gowatchseries.*",69],["hdfungamezz.*",69],["hdtoday.to",69],["hinatasoul.com",69],["hindilinks4u.*",69],["hurawatch.*",[69,216]],["igg-games.com",69],["infinityscans.net",69],["jalshamoviezhd.*",69],["livecricket.*",69],["mangareader.to",69],["mhdsport.*",69],["mkvcinemas.*",69],["movies2watch.*",69],["moviespapa.*",69],["mp3juice.info",69],["mp4moviez.*",69],["mydownloadtube.*",69],["myflixerz.to",69],["nowmetv.net",69],["nowsportstv.com",69],["nuroflix.*",69],["nxbrew.com",69],["o2tvseries.*",69],["o2tvseriesz.*",69],["oii.io",69],["paidshitforfree.com",69],["pepperlive.info",69],["pirlotv.*",69],["playertv.net",69],["poscitech.*",69],["primewire.*",69],["redecanais.*",69],["roystream.com",69],["rssing.com",69],["s.to",69],["serienstream.*",69],["sflix.*",69],["shahed4u.*",69],["shaheed4u.*",69],["share.filesh.site",69],["sharkfish.xyz",69],["skidrowcodex.net",69],["smartermuver.com",69],["speedostream.*",69],["sportcast.*",69],["sportskart.*",69],["stream4free.live",69],["streamingcommunity.*",[69,71,109]],["tamilarasan.*",69],["tamilfreemp3songs.*",69],["tamilmobilemovies.in",69],["tamilprinthd.*",69],["tapeadsenjoyer.com",[69,89]],["thewatchseries.live",69],["tnmusic.in",69],["torrentdosfilmes.*",69],["travelplanspro.com",69],["tubemate.*",69],["tusfiles.com",69],["tutlehd4.com",69],["twstalker.com",69],["uploadrar.*",69],["uqload.*",69],["vid-guard.com",69],["vidcloud9.*",69],["vido.*",69],["vidoo.*",69],["vidsaver.net",69],["vidspeeds.com",69],["viralitytoday.com",69],["voiranime.stream",69],["vudeo.*",69],["vumoo.*",69],["watchdoctorwhoonline.com",69],["watchomovies.*",[69,106]],["watchserie.online",69],["woxikon.in",69],["www-y2mate.com",69],["yesmovies.*",69],["ylink.bid",69],["xn-----0b4asja7ccgu2b4b0gd0edbjm2jpa1b1e9zva7a0347s4da2797e8qri.xn--1ck2e1b",69],["kickassanime.*",70],["11xmovies.*",71],["cinego.tv",71],["dokoembed.pw",71],["ev01.to",71],["fojik.*",71],["fstream365.com",71],["fzmovies.*",71],["linkz.*",71],["minoplres.xyz",71],["mostream.us",71],["moviedokan.*",71],["myflixer.*",71],["prmovies.*",71],["readcomiconline.li",71],["s3embtaku.pro",71],["sflix2.to",71],["sportshub.stream",71],["streamblasters.*",71],["topcinema.cam",71],["webxzplay.cfd",71],["zonatmo.com",71],["animesaturn.cx",71],["filecrypt.*",71],["hunterscomics.com",71],["aniwave.uk",71],["dojing.net",72],["javsubindo.com",72],["krx18.com",72],["loadx.ws",72],["mangaforfree.com",72],["pornx.to",72],["savefiles.*",[72,249]],["streampoi.com",72],["strmup.to",[72,142]],["up4stream.com",[72,106]],["ups2up.fun",[72,106]],["videq.stream",72],["xmegadrive.com",72],["rahim-soft.com",72],["x-video.tube",72],["rubystm.com",72],["rubyvid.com",72],["rubyvidhub.com",72],["stmruby.com",72],["streamruby.com",72],["poophd.cc",72],["windowsreport.com",72],["fuckflix.click",72],["bi-girl.net",73],["ftuapps.*",73],["hentaiseason.com",73],["hoodtrendspredict.com",73],["marcialhub.xyz",73],["odiadance.com",73],["osteusfilmestuga.online",73],["ragnarokscanlation.opchapters.com",73],["sampledrive.org",73],["showflix.*",73],["swordalada.org",73],["tvappapk.com",73],["twobluescans.com",[73,74]],["varnascan.xyz",73],["bibliopanda.visblog.online",75],["hallofseries.com",75],["luciferdonghua.in",75],["truyentranhfull.net",75],["fcportables.com",75],["repack-games.com",75],["ibooks.to",75],["blog.tangwudi.com",75],["filecatchers.com",75],["babaktv.com",75],["samchui.com",76],["sandrarose.com",76],["sherdog.com",76],["sidereel.com",76],["silive.com",76],["simpleflying.com",76],["sloughexpress.co.uk",76],["spacenews.com",76],["sportsgamblingpodcast.com",76],["spotofteadesigns.com",76],["stacysrandomthoughts.com",76],["ssnewstelegram.com",76],["superherohype.com",[76,79]],["tablelifeblog.com",76],["thebeautysection.com",76],["thecelticblog.com",76],["thecurvyfashionista.com",76],["thefashionspot.com",76],["thegamescabin.com",76],["thenerdyme.com",76],["thenonconsumeradvocate.com",76],["theprudentgarden.com",76],["thethings.com",76],["timesnews.net",76],["topspeed.com",76],["toyotaklub.org.pl",76],["travelingformiles.com",76],["tutsnode.org",76],["viralviralvideos.com",76],["wannacomewith.com",76],["wimp.com",[76,79]],["windsorexpress.co.uk",76],["woojr.com",76],["worldoftravelswithkids.com",76],["worldsurfleague.com",76],["cheatsheet.com",77],["pwinsider.com",77],["c-span.org",78],["15min.lt",79],["247sports.com",79],["abc17news.com",79],["agrodigital.com",79],["al.com",79],["aliontherunblog.com",79],["allaboutthetea.com",79],["allmovie.com",79],["allmusic.com",79],["allthingsthrifty.com",79],["amessagewithabottle.com",79],["artforum.com",79],["artnews.com",79],["awkward.com",79],["barcablaugranes.com",79],["barnsleychronicle.com",79],["bethcakes.com",79],["betweenenglandandiowa.com",79],["bgr.com",79],["blazersedge.com",79],["blogher.com",79],["blu-ray.com",79],["bluegraygal.com",79],["briefeguru.de",79],["brobible.com",79],["cagesideseats.com",79],["cbsnews.com",79],["cbssports.com",[79,254]],["celiacandthebeast.com",79],["chaptercheats.com",79],["cleveland.com",79],["clickondetroit.com",79],["commercialcompetentedigitale.ro",79],["dailydot.com",79],["dailykos.com",79],["dailyvoice.com",79],["danslescoulisses.com",79],["decider.com",79],["didyouknowfacts.com",79],["dogtime.com",79],["dpreview.com",79],["ebaumsworld.com",79],["eldiariony.com",79],["fark.com",79],["femestella.com",79],["fmradiofree.com",79],["free-power-point-templates.com",79],["freeconvert.com",79],["frogsandsnailsandpuppydogtail.com",79],["funtasticlife.com",79],["fwmadebycarli.com",79],["golfdigest.com",79],["gulflive.com",79],["hollywoodreporter.com",79],["homeglowdesign.com",79],["honeygirlsworld.com",79],["ibtimes.co.in",79],["imgur.com",79],["indiewire.com",79],["intouchweekly.com",79],["jasminemaria.com",79],["kens5.com",79],["kion546.com",79],["knowyourmeme.com",79],["last.fm",79],["lehighvalleylive.com",79],["lettyskitchen.com",79],["lifeandstylemag.com",79],["lifeinleggings.com",79],["lizzieinlace.com",79],["localnews8.com",79],["lonestarlive.com",79],["madeeveryday.com",79],["maidenhead-advertiser.co.uk",79],["mandatory.com",79],["mardomreport.net",79],["masslive.com",79],["melangery.com",79],["miamiherald.com",79],["mmamania.com",79],["momtastic.com",79],["mostlymorgan.com",79],["motherwellmag.com",79],["musicfeeds.com.au",79],["naszemiasto.pl",79],["nationalpost.com",79],["nationalreview.com",79],["nbcsports.com",79],["news.com.au",79],["ninersnation.com",79],["nj.com",79],["nordot.app",79],["nothingbutnewcastle.com",79],["nsjonline.com",79],["nypost.com",79],["observer.com",79],["oregonlive.com",79],["pagesix.com",79],["patheos.com",79],["pennlive.com",79],["playstationlifestyle.net",79],["puckermom.com",79],["reelmama.com",79],["robbreport.com",79],["rollingstone.com",79],["royalmailchat.co.uk",79],["sbnation.com",79],["sheknows.com",79],["sneakernews.com",79],["sourcingjournal.com",79],["sport-fm.gr",79],["stylecaster.com",79],["syracuse.com",79],["tastingtable.com",79],["thedailymeal.com",79],["theflowspace.com",79],["themarysue.com",79],["tokfm.pl",79],["torontosun.com",79],["tvline.com",79],["usmagazine.com",79],["wallup.net",79],["weather.com",79],["worldstar.com",79],["worldstarhiphop.com",79],["wwd.com",79],["wzzm13.com",79],["yourcountdown.to",79],["automobile-catalog.com",[80,81,82]],["baseballchannel.jp",[80,81]],["forum.mobilism.me",80],["gentosha-go.com",80],["hang.hu",80],["hoyme.jp",80],["motorbikecatalog.com",[80,81,82]],["pons.com",80],["wisevoter.com",80],["topstarnews.net",80],["islamicfinder.org",80],["secure-signup.net",80],["dramabeans.com",80],["dropgame.jp",[80,81]],["manta.com",80],["tportal.hr",80],["tvtropes.org",80],["convertcase.net",80],["uranai.nosv.org",81],["yakkun.com",81],["24sata.hr",81],["373news.com",81],["alc.co.jp",81],["allthetests.com",81],["animanch.com",81],["aniroleplay.com",81],["apkmirror.com",[81,186]],["areaconnect.com",81],["as-web.jp",81],["aucfree.com",81],["autoby.jp",81],["autoc-one.jp",81],["autofrage.net",81],["bab.la",81],["babla.*",81],["bien.hu",81],["boredpanda.com",81],["carscoops.com",81],["cesoirtv.com",81],["chanto.jp.net",81],["cinetrafic.fr",81],["cocokara-next.com",81],["collinsdictionary.com",81],["computerfrage.net",81],["crosswordsolver.com",81],["cruciverba.it",81],["cults3d.com",81],["daily.co.jp",81],["dailynewshungary.com",81],["dayspedia.com",81],["dictionary.cambridge.org",81],["dictionnaire.lerobert.com",81],["dnevno.hr",81],["dreamchance.net",81],["drweil.com",81],["dziennik.pl",81],["eigachannel.jp",81],["ev-times.com",81],["finanzfrage.net",81],["footballchannel.jp",81],["forsal.pl",81],["freemcserver.net",81],["fxstreet-id.com",81],["fxstreet-vn.com",81],["fxstreet.*",81],["game8.jp",81],["gardeningsoul.com",81],["gazetaprawna.pl",81],["gesundheitsfrage.net",81],["gifu-np.co.jp",81],["gigafile.nu",81],["globalrph.com",81],["golf-live.at",81],["grapee.jp",81],["gutefrage.net",81],["hb-nippon.com",81],["heureka.cz",81],["horairesdouverture24.fr",81],["hotcopper.co.nz",81],["hotcopper.com.au",81],["idokep.hu",81],["indiatimes.com",81],["infor.pl",81],["iza.ne.jp",81],["j-cast.com",81],["j-town.net",81],["j7p.jp",81],["jablickar.cz",81],["javatpoint.com",81],["jikayosha.jp",81],["judgehype.com",81],["kinmaweb.jp",81],["km77.com",81],["kobe-journal.com",81],["kreuzwortraetsel.de",81],["kurashinista.jp",81],["kurashiru.com",81],["kyoteibiyori.com",81],["lacuarta.com",81],["lakeshowlife.com",81],["laleggepertutti.it",81],["langenscheidt.com",81],["laposte.net",81],["lawyersgunsmoneyblog.com",81],["ldoceonline.com",81],["listentotaxman.com",81],["livenewschat.eu",81],["luremaga.jp",81],["mahjongchest.com",81],["mainichi.jp",81],["maketecheasier.com",[81,82]],["malaymail.com",81],["mamastar.jp",81],["mathplayzone.com",81],["meteo60.fr",81],["midhudsonnews.com",81],["minesweeperquest.com",81],["minkou.jp",81],["modhub.us",81],["moin.de",81],["motorradfrage.net",81],["motscroises.fr",81],["muragon.com",81],["nana-press.com",81],["natalie.mu",81],["nationaltoday.com",81],["nbadraft.net",81],["news.zerkalo.io",81],["newsinlevels.com",81],["newsweekjapan.jp",81],["niketalk.com",81],["nikkan-gendai.com",81],["nouvelobs.com",81],["nyitvatartas24.hu",81],["oeffnungszeitenbuch.de",81],["onlineradiobox.com",81],["operawire.com",81],["optionsprofitcalculator.com",81],["oraridiapertura24.it",81],["oxfordlearnersdictionaries.com",81],["palabr.as",81],["pashplus.jp",81],["persoenlich.com",81],["petitfute.com",81],["play-games.com",81],["powerpyx.com",81],["pptvhd36.com",81],["profitline.hu",81],["puzzlegarage.com",81],["quefaire.be",81],["radio-australia.org",81],["radio-osterreich.at",81],["raetsel-hilfe.de",81],["ranking.net",81],["references.be",81],["reisefrage.net",81],["relevantmagazine.com",81],["reptilesmagazine.com",81],["roleplayer.me",81],["rostercon.com",81],["samsungmagazine.eu",81],["sankei.com",81],["sanspo.com",81],["scribens.com",81],["scribens.fr",81],["slashdot.org",81],["soccerdigestweb.com",81],["solitairehut.com",81],["sourceforge.net",[81,85]],["southhemitv.com",81],["sportalkorea.com",81],["sportlerfrage.net",81],["syosetu.com",81],["szamoldki.hu",81],["talkwithstranger.com",81],["the-crossword-solver.com",81],["thedigestweb.com",81],["traicy.com",81],["transparentcalifornia.com",81],["transparentnevada.com",81],["trilltrill.jp",81],["tunebat.com",81],["tvtv.ca",81],["tvtv.us",81],["tweaktown.com",81],["twn.hu",81],["tyda.se",81],["ufret.jp",81],["uptodown.com",81],["verkaufsoffener-sonntag.com",81],["vimm.net",81],["wamgame.jp",81],["watchdocumentaries.com",81],["webdesignledger.com",81],["wetteronline.de",81],["wfmz.com",81],["winfuture.de",81],["word-grabber.com",81],["worldjournal.com",81],["wort-suchen.de",81],["woxikon.*",81],["young-machine.com",81],["yugioh-starlight.com",81],["yutura.net",81],["zagreb.info",81],["zakzak.co.jp",81],["2chblog.jp",81],["2monkeys.jp",81],["46matome.net",81],["akb48glabo.com",81],["akb48matomemory.com",81],["alfalfalfa.com",81],["all-nationz.com",81],["anihatsu.com",81],["aqua2ch.net",81],["blog.esuteru.com",81],["blog.livedoor.jp",81],["blog.jp",81],["blogo.jp",81],["chaos2ch.com",81],["choco0202.work",81],["crx7601.com",81],["danseisama.com",81],["dareda.net",81],["digital-thread.com",81],["doorblog.jp",81],["exawarosu.net",81],["fgochaldeas.com",81],["football-2ch.com",81],["gekiyaku.com",81],["golog.jp",81],["hacchaka.net",81],["heartlife-matome.com",81],["liblo.jp",81],["fesoku.net",81],["fiveslot777.com",81],["gamejksokuhou.com",81],["girlsreport.net",81],["girlsvip-matome.com",81],["grasoku.com",81],["gundamlog.com",81],["honyaku-channel.net",81],["ikarishintou.com",81],["imas-cg.net",81],["imihu.net",81],["inutomo11.com",81],["itainews.com",81],["itaishinja.com",81],["jin115.com",81],["jisaka.com",81],["jnews1.com",81],["jumpsokuhou.com",81],["jyoseisama.com",81],["keyakizaka46matomemory.net",81],["kidan-m.com",81],["kijoden.com",81],["kijolariat.net",81],["kijolifehack.com",81],["kijomatomelog.com",81],["kijyokatu.com",81],["kijyomatome.com",81],["kijyomatome-ch.com",81],["kijyomita.com",81],["kirarafan.com",81],["kitimama-matome.net",81],["kitizawa.com",81],["konoyubitomare.jp",81],["kotaro269.com",81],["kyousoku.net",81],["ldblog.jp",81],["livedoor.biz",81],["livedoor.blog",81],["majikichi.com",81],["matacoco.com",81],["matomeblade.com",81],["matomelotte.com",81],["matometemitatta.com",81],["mojomojo-licarca.com",81],["morikinoko.com",81],["nandemo-uketori.com",81],["netatama.net",81],["news-buzz1.com",81],["news30over.com",81],["nishinippon.co.jp",81],["nmb48-mtm.com",81],["norisoku.com",81],["npb-news.com",81],["ocsoku.com",81],["okusama-kijyo.com",81],["onecall2ch.com",81],["onihimechan.com",81],["orusoku.com",81],["otakomu.jp",81],["otoko-honne.com",81],["oumaga-times.com",81],["outdoormatome.com",81],["pachinkopachisro.com",81],["paranormal-ch.com",81],["recosoku.com",81],["s2-log.com",81],["saikyo-jump.com",81],["shuraba-matome.com",81],["ske48matome.net",81],["squallchannel.com",81],["sukattojapan.com",81],["sumaburayasan.com",81],["sutekinakijo.com",81],["usi32.com",81],["uwakich.com",81],["uwakitaiken.com",81],["vault76.info",81],["vipnews.jp",81],["vippers.jp",81],["vipsister23.com",81],["vtubernews.jp",81],["watarukiti.com",81],["world-fusigi.net",81],["zakuzaku911.com",81],["zch-vip.com",81],["interfootball.co.kr",82],["a-ha.io",82],["cboard.net",82],["jjang0u.com",82],["joongdo.co.kr",82],["viva100.com",82],["gamingdeputy.com",82],["alle-tests.nl",82],["tweaksforgeeks.com",82],["m.inven.co.kr",82],["mlbpark.donga.com",82],["meconomynews.com",82],["brandbrief.co.kr",82],["motorgraph.com",82],["bleepingcomputer.com",83],["pravda.com.ua",83],["ap7am.com",84],["cinema.com.my",84],["dolldivine.com",84],["giornalone.it",84],["iplocation.net",84],["jamaicajawapos.com",84],["jutarnji.hr",84],["kompasiana.com",84],["mediaindonesia.com",84],["niice-woker.com",84],["slobodnadalmacija.hr",84],["upmedia.mg",84],["mentalfloss.com",86],["hentaivost.fr",87],["isgfrm.com",88],["advertisertape.com",89],["tapeadvertisement.com",89],["tapelovesads.org",89],["watchadsontape.com",89],["vosfemmes.com",90],["voyeurfrance.net",90],["hyundaitucson.info",91],["exambd.net",92],["cgtips.org",93],["freewebcart.com",94],["freemagazines.top",94],["siamblockchain.com",94],["emuenzen.de",95],["kickass.*",96],["unblocked.id",98],["listendata.com",99],["7xm.xyz",99],["fastupload.io",99],["azmath.info",99],["wouterplanet.com",100],["xenvn.com",101],["pfps.gg",102],["4kporn.xxx",103],["androidacy.com",104],["4porn4.com",105],["bestpornflix.com",106],["freeroms.com",106],["andhrafriends.com",106],["723qrh1p.fun",106],["98zero.com",107],["mediaset.es",107],["updatewallah.in",107],["hwbusters.com",107],["beatsnoop.com",108],["fetchpik.com",108],["hackerranksolution.in",108],["camsrip.com",108],["file.org",108],["btcbunch.com",110],["teachoo.com",[111,112]],["mafiatown.pl",113],["bitcotasks.com",114],["hilites.today",115],["udvl.com",116],["www.chip.de",[117,118,119,120]],["topsporter.net",121],["sportshub.to",121],["myanimelist.net",122],["unofficialtwrp.com",123],["codec.kyiv.ua",123],["kimcilonlyofc.com",123],["bitcosite.com",124],["bitzite.com",124],["teluguflix.*",125],["hacoos.com",126],["watchhentai.net",127],["hes-goals.io",127],["pkbiosfix.com",127],["casi3.xyz",127],["zefoy.com",128],["mailgen.biz",129],["tempinbox.xyz",129],["vidello.net",130],["newscon.org",131],["yunjiema.top",131],["pcgeeks-games.com",131],["resizer.myct.jp",132],["gametohkenranbu.sakuraweb.com",133],["jisakuhibi.jp",134],["rank1-media.com",134],["lifematome.blog",135],["fm.sekkaku.net",136],["dvdrev.com",137],["betweenjpandkr.blog",138],["nft-media.net",139],["ghacks.net",140],["leak.sx",141],["paste.bin.sx",141],["pornleaks.in",141],["aliezstream.pro",142],["daddy-stream.xyz",142],["daddylive1.*",142],["esportivos.*",142],["instream.pro",142],["mylivestream.pro",142],["poscitechs.*",142],["powerover.online",142],["sportea.link",142],["sportsurge.stream",142],["ufckhabib.com",142],["ustream.pro",142],["animeshqip.site",142],["apkship.shop",142],["buzter.pro",142],["enjoysports.bond",142],["filedot.to",142],["foreverquote.xyz",142],["hdstream.one",142],["kingstreamz.site",142],["live.fastsports.store",142],["livesnow.me",142],["livesports4u.pw",142],["masterpro.click",142],["nuxhallas.click",142],["papahd.info",142],["rgshows.me",142],["sportmargin.live",142],["sportmargin.online",142],["sportsloverz.xyz",142],["supertipzz.online",142],["totalfhdsport.xyz",142],["ultrastreamlinks.xyz",142],["usgate.xyz",142],["webmaal.cfd",142],["wizistreamz.xyz",142],["educ4m.com",142],["fromwatch.com",142],["visualnewshub.com",142],["khoaiphim.com",144],["haafedk2.com",145],["jovemnerd.com.br",146],["totalcsgo.com",147],["manysex.com",148],["gaminginfos.com",149],["tinxahoivn.com",150],["m.4khd.com",151],["westmanga.*",151],["automoto.it",152],["fordownloader.com",153],["codelivly.com",154],["tchatche.com",155],["cryptoearns.com",155],["lordchannel.com",156],["novelhall.com",157],["bagi.co.in",158],["keran.co",158],["biblestudytools.com",159],["christianheadlines.com",159],["ibelieve.com",159],["kuponigo.com",160],["inxxx.com",161],["bemyhole.com",161],["embedwish.com",162],["leakslove.net",162],["jenismac.com",163],["vxetable.cn",164],["nizarstream.com",165],["donghuaworld.com",166],["letsdopuzzles.com",167],["rediff.com",168],["igay69.com",169],["dzapk.com",170],["darknessporn.com",171],["familyporner.com",171],["freepublicporn.com",171],["pisshamster.com",171],["punishworld.com",171],["xanimu.com",171],["tainio-mania.online",172],["eroticmoviesonline.me",173],["series9movies.com",173],["teleclub.xyz",174],["ecamrips.com",175],["showcamrips.com",175],["tucinehd.com",176],["9animetv.to",177],["qiwi.gg",178],["jornadaperfecta.com",179],["loseart.com",180],["sousou-no-frieren.com",181],["unite-guide.com",183],["thebullspen.com",184],["receitasdaora.online",185],["hiraethtranslation.com",187],["all3do.com",188],["d0000d.com",188],["d000d.com",188],["d0o0d.com",188],["do0od.com",188],["do7go.com",188],["doods.*",188],["doodstream.*",188],["dooodster.com",188],["doply.net",188],["ds2play.com",188],["ds2video.com",188],["vidply.com",188],["vide0.net",188],["xfreehd.com",189],["freethesaurus.com",190],["thefreedictionary.com",190],["dexterclearance.com",191],["x86.co.kr",192],["onlyfaucet.com",193],["x-x-x.tube",194],["fdownloader.net",195],["thehackernews.com",196],["mielec.pl",197],["treasl.com",198],["mrbenne.com",199],["cnpics.org",[200,258]],["ovabee.com",200],["porn4f.com",200],["cnxx.me",[200,258]],["ai18.pics",[200,258]],["sportsonline.si",201],["fiuxy2.co",202],["animeunity.to",203],["tokopedia.com",204],["remixsearch.net",205],["remixsearch.es",205],["onlineweb.tools",205],["sharing.wtf",205],["2024tv.ru",206],["modrinth.com",207],["curseforge.com",207],["xnxxcom.xyz",208],["sportsurge.net",209],["joyousplay.xyz",209],["quest4play.xyz",[209,211]],["generalpill.net",209],["moneycontrol.com",210],["cookiewebplay.xyz",211],["ilovetoplay.xyz",211],["streamcaster.live",211],["weblivehdplay.ru",211],["nontongo.win",212],["m9.news",213],["callofwar.com",214],["secondhandsongs.com",215],["nohost.one",216],["vidbinge.com",216],["send.cm",217],["send.now",217],["3rooodnews.net",218],["xxxbfvideo.net",219],["filmy4wap.co.in",220],["filmy4waps.org",220],["gameshop4u.com",221],["regenzi.site",221],["historicaerials.com",222],["handirect.fr",223],["animefenix.tv",224],["fsiblog3.club",225],["kamababa.desi",225],["sat-sharing.com",225],["getfiles.co.uk",226],["genelify.com",227],["dhtpre.com",228],["xbaaz.com",229],["lineupexperts.com",231],["fearmp4.ru",232],["buffsports.*",233],["fbstreams.*",233],["wavewalt.me",233],["m.shuhaige.net",234],["streamingnow.mov",235],["thesciencetoday.com",236],["sportnews.to",236],["ghbrisk.com",238],["iplayerhls.com",238],["bacasitus.com",239],["katoikos.world",239],["abstream.to",240],["pawastreams.pro",241],["rebajagratis.com",242],["tv.latinlucha.es",242],["fetcheveryone.com",243],["reviewdiv.com",244],["laurelberninteriors.com",245],["godlike.com",246],["godlikeproductions.com",246],["bestsportslive.org",247],["bestreamsports.org",248],["streamhls.to",250],["xmalay1.net",251],["letemsvetemapplem.eu",252],["pc-builds.com",253],["watch-dbz57.funonline.co.in",255],["live4all.net",256],["pokemon-project.com",257],["3minx.com",258],["555fap.com",258],["blackwidof.org",258],["fc2ppv.stream",258],["hentai4f.com",258],["hentaipig.com",258],["javball.com",258],["javbee.vip",258],["javring.com",258],["javsunday.com",258],["kin8-av.com",258],["porn4f.org",258],["sweetie-fox.com",258],["xcamcovid.com",258],["moviesonlinefree.*",259],["fileszero.com",260],["viralharami.com",260],["wstream.cloud",260],["bmamag.com",261],["bmacanberra.wpcomstaging.com",261],["cinemastervip.com",262],["mmsbee42.com",263],["mmsmasala.com",263],["fnjplay.xyz",264],["cefirates.com",265],["comicleaks.com",265],["tapmyback.com",265],["ping.gg",265],["nookgaming.com",265],["creatordrop.com",265],["bitdomain.biz",265],["fort-shop.kiev.ua",265],["accuretawealth.com",265],["resourceya.com",265],["tracktheta.com",265],["adaptive.marketing",265],["camberlion.com",265],["trybawaryjny.pl",265],["segops.madisonspecs.com",265],["stresshelden-coaching.de",265],["controlconceptsusa.com",265],["ryaktive.com",265],["tip.etip-staging.etip.io",265],["future-fortune.com",266],["furucombo.app",266],["bolighub.dk",266],["intercity.technology",267],["freelancer.taxmachine.be",267],["adria.gg",267],["fjlaboratories.com",267],["abhijith.page",267],["helpmonks.com",267],["dataunlocker.com",268],["proboards.com",269],["winclassic.net",269],["farmersjournal.ie",270]]);
const exceptionsMap = new Map([["chatango.com",[6]],["twitter.com",[6]],["youtube.com",[6]]]);
const hasEntities = true;
const hasAncestors = true;

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
    try { removeNodeText(...argsList[i]); }
    catch { }
}

/******************************************************************************/

// End of local scope
})();

void 0;
