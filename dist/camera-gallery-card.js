/*! camera-gallery-card v2.7.0 | MIT */
!function(){"use strict";const e=globalThis,t=e.ShadowRoot&&(void 0===e.ShadyCSS||e.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,i=Symbol(),n=new WeakMap;let s=class{constructor(e,t,n){if(this._$cssResult$=!0,n!==i)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o;const i=this.t;if(t&&void 0===e){const t=void 0!==i&&1===i.length;t&&(e=n.get(i)),void 0===e&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),t&&n.set(i,e))}return e}toString(){return this.cssText}};const r=(e,...t)=>{const n=1===e.length?e[0]:t.reduce((t,i,n)=>t+(e=>{if(!0===e._$cssResult$)return e.cssText;if("number"==typeof e)return e;throw Error("Value passed to 'css' function must be a 'css' function result: "+e+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(i)+e[n+1],e[0]);return new s(n,e,i)},o=t?e=>e:e=>e instanceof CSSStyleSheet?(e=>{let t="";for(const i of e.cssRules)t+=i.cssText;return(e=>new s("string"==typeof e?e:e+"",void 0,i))(t)})(e):e,{is:a,defineProperty:l,getOwnPropertyDescriptor:c,getOwnPropertyNames:d,getOwnPropertySymbols:h,getPrototypeOf:p}=Object,u=globalThis,m=u.trustedTypes,g=m?m.emptyScript:"",_=u.reactiveElementPolyfillSupport,v=(e,t)=>e,b={toAttribute(e,t){switch(t){case Boolean:e=e?g:null;break;case Object:case Array:e=null==e?e:JSON.stringify(e)}return e},fromAttribute(e,t){let i=e;switch(t){case Boolean:i=null!==e;break;case Number:i=null===e?null:Number(e);break;case Object:case Array:try{i=JSON.parse(e)}catch(e){i=null}}return i}},f=(e,t)=>!a(e,t),y={attribute:!0,type:String,converter:b,reflect:!1,useDefault:!1,hasChanged:f};Symbol.metadata??=Symbol("metadata"),u.litPropertyMetadata??=new WeakMap;let w=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??=[]).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=y){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){const i=Symbol(),n=this.getPropertyDescriptor(e,i,t);void 0!==n&&l(this.prototype,e,n)}}static getPropertyDescriptor(e,t,i){const{get:n,set:s}=c(this.prototype,e)??{get(){return this[t]},set(e){this[t]=e}};return{get:n,set(t){const r=n?.call(this);s?.call(this,t),this.requestUpdate(e,r,i)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??y}static _$Ei(){if(this.hasOwnProperty(v("elementProperties")))return;const e=p(this);e.finalize(),void 0!==e.l&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(v("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(v("properties"))){const e=this.properties,t=[...d(e),...h(e)];for(const i of t)this.createProperty(i,e[i])}const e=this[Symbol.metadata];if(null!==e){const t=litPropertyMetadata.get(e);if(void 0!==t)for(const[e,i]of t)this.elementProperties.set(e,i)}this._$Eh=new Map;for(const[e,t]of this.elementProperties){const i=this._$Eu(e,t);void 0!==i&&this._$Eh.set(i,e)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const t=[];if(Array.isArray(e)){const i=new Set(e.flat(1/0).reverse());for(const e of i)t.unshift(o(e))}else void 0!==e&&t.push(o(e));return t}static _$Eu(e,t){const i=t.attribute;return!1===i?void 0:"string"==typeof i?i:"string"==typeof e?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(e=>this.enableUpdating=e),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(e=>e(this))}addController(e){(this._$EO??=new Set).add(e),void 0!==this.renderRoot&&this.isConnected&&e.hostConnected?.()}removeController(e){this._$EO?.delete(e)}_$E_(){const e=new Map,t=this.constructor.elementProperties;for(const i of t.keys())this.hasOwnProperty(i)&&(e.set(i,this[i]),delete this[i]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const i=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return((i,n)=>{if(t)i.adoptedStyleSheets=n.map(e=>e instanceof CSSStyleSheet?e:e.styleSheet);else for(const t of n){const n=document.createElement("style"),s=e.litNonce;void 0!==s&&n.setAttribute("nonce",s),n.textContent=t.cssText,i.appendChild(n)}})(i,this.constructor.elementStyles),i}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach(e=>e.hostConnected?.())}enableUpdating(e){}disconnectedCallback(){this._$EO?.forEach(e=>e.hostDisconnected?.())}attributeChangedCallback(e,t,i){this._$AK(e,i)}_$ET(e,t){const i=this.constructor.elementProperties.get(e),n=this.constructor._$Eu(e,i);if(void 0!==n&&!0===i.reflect){const s=(void 0!==i.converter?.toAttribute?i.converter:b).toAttribute(t,i.type);this._$Em=e,null==s?this.removeAttribute(n):this.setAttribute(n,s),this._$Em=null}}_$AK(e,t){const i=this.constructor,n=i._$Eh.get(e);if(void 0!==n&&this._$Em!==n){const e=i.getPropertyOptions(n),s="function"==typeof e.converter?{fromAttribute:e.converter}:void 0!==e.converter?.fromAttribute?e.converter:b;this._$Em=n;const r=s.fromAttribute(t,e.type);this[n]=r??this._$Ej?.get(n)??r,this._$Em=null}}requestUpdate(e,t,i,n=!1,s){if(void 0!==e){const r=this.constructor;if(!1===n&&(s=this[e]),i??=r.getPropertyOptions(e),!((i.hasChanged??f)(s,t)||i.useDefault&&i.reflect&&s===this._$Ej?.get(e)&&!this.hasAttribute(r._$Eu(e,i))))return;this.C(e,t,i)}!1===this.isUpdatePending&&(this._$ES=this._$EP())}C(e,t,{useDefault:i,reflect:n,wrapped:s},r){i&&!(this._$Ej??=new Map).has(e)&&(this._$Ej.set(e,r??t??this[e]),!0!==s||void 0!==r)||(this._$AL.has(e)||(this.hasUpdated||i||(t=void 0),this._$AL.set(e,t)),!0===n&&this._$Em!==e&&(this._$Eq??=new Set).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(e){Promise.reject(e)}const e=this.scheduleUpdate();return null!=e&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(const[e,t]of this._$Ep)this[e]=t;this._$Ep=void 0}const e=this.constructor.elementProperties;if(e.size>0)for(const[t,i]of e){const{wrapped:e}=i,n=this[t];!0!==e||this._$AL.has(t)||void 0===n||this.C(t,void 0,i,n)}}let e=!1;const t=this._$AL;try{e=this.shouldUpdate(t),e?(this.willUpdate(t),this._$EO?.forEach(e=>e.hostUpdate?.()),this.update(t)):this._$EM()}catch(t){throw e=!1,this._$EM(),t}e&&this._$AE(t)}willUpdate(e){}_$AE(e){this._$EO?.forEach(e=>e.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&=this._$Eq.forEach(e=>this._$ET(e,this[e])),this._$EM()}updated(e){}firstUpdated(e){}};w.elementStyles=[],w.shadowRootOptions={mode:"open"},w[v("elementProperties")]=new Map,w[v("finalized")]=new Map,_?.({ReactiveElement:w}),(u.reactiveElementVersions??=[]).push("2.1.2");const x=globalThis,S=e=>e,k=x.trustedTypes,$=k?k.createPolicy("lit-html",{createHTML:e=>e}):void 0,A="$lit$",C=`lit$${Math.random().toFixed(9).slice(2)}$`,L="?"+C,M=`<${L}>`,E=document,z=()=>E.createComment(""),T=e=>null===e||"object"!=typeof e&&"function"!=typeof e,P=Array.isArray,F="[ \t\n\f\r]",H=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,R=/-->/g,j=/>/g,I=RegExp(`>|${F}(?:([^\\s"'>=/]+)(${F}*=${F}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`,"g"),V=/'/g,O=/"/g,D=/^(?:script|style|textarea|title)$/i,B=(e=>(t,...i)=>({_$litType$:e,strings:t,values:i}))(1),N=Symbol.for("lit-noChange"),q=Symbol.for("lit-nothing"),W=new WeakMap,U=E.createTreeWalker(E,129);function K(e,t){if(!P(e)||!e.hasOwnProperty("raw"))throw Error("invalid template strings array");return void 0!==$?$.createHTML(t):t}const Y=(e,t)=>{const i=e.length-1,n=[];let s,r=2===t?"<svg>":3===t?"<math>":"",o=H;for(let t=0;t<i;t++){const i=e[t];let a,l,c=-1,d=0;for(;d<i.length&&(o.lastIndex=d,l=o.exec(i),null!==l);)d=o.lastIndex,o===H?"!--"===l[1]?o=R:void 0!==l[1]?o=j:void 0!==l[2]?(D.test(l[2])&&(s=RegExp("</"+l[2],"g")),o=I):void 0!==l[3]&&(o=I):o===I?">"===l[0]?(o=s??H,c=-1):void 0===l[1]?c=-2:(c=o.lastIndex-l[2].length,a=l[1],o=void 0===l[3]?I:'"'===l[3]?O:V):o===O||o===V?o=I:o===R||o===j?o=H:(o=I,s=void 0);const h=o===I&&e[t+1].startsWith("/>")?" ":"";r+=o===H?i+M:c>=0?(n.push(a),i.slice(0,c)+A+i.slice(c)+C+h):i+C+(-2===c?t:h)}return[K(e,r+(e[i]||"<?>")+(2===t?"</svg>":3===t?"</math>":"")),n]};class Z{constructor({strings:e,_$litType$:t},i){let n;this.parts=[];let s=0,r=0;const o=e.length-1,a=this.parts,[l,c]=Y(e,t);if(this.el=Z.createElement(l,i),U.currentNode=this.el.content,2===t||3===t){const e=this.el.content.firstChild;e.replaceWith(...e.childNodes)}for(;null!==(n=U.nextNode())&&a.length<o;){if(1===n.nodeType){if(n.hasAttributes())for(const e of n.getAttributeNames())if(e.endsWith(A)){const t=c[r++],i=n.getAttribute(e).split(C),o=/([.?@])?(.*)/.exec(t);a.push({type:1,index:s,name:o[2],strings:i,ctor:"."===o[1]?ee:"?"===o[1]?te:"@"===o[1]?ie:G}),n.removeAttribute(e)}else e.startsWith(C)&&(a.push({type:6,index:s}),n.removeAttribute(e));if(D.test(n.tagName)){const e=n.textContent.split(C),t=e.length-1;if(t>0){n.textContent=k?k.emptyScript:"";for(let i=0;i<t;i++)n.append(e[i],z()),U.nextNode(),a.push({type:2,index:++s});n.append(e[t],z())}}}else if(8===n.nodeType)if(n.data===L)a.push({type:2,index:s});else{let e=-1;for(;-1!==(e=n.data.indexOf(C,e+1));)a.push({type:7,index:s}),e+=C.length-1}s++}}static createElement(e,t){const i=E.createElement("template");return i.innerHTML=e,i}}function X(e,t,i=e,n){if(t===N)return t;let s=void 0!==n?i._$Co?.[n]:i._$Cl;const r=T(t)?void 0:t._$litDirective$;return s?.constructor!==r&&(s?._$AO?.(!1),void 0===r?s=void 0:(s=new r(e),s._$AT(e,i,n)),void 0!==n?(i._$Co??=[])[n]=s:i._$Cl=s),void 0!==s&&(t=X(e,s._$AS(e,t.values),s,n)),t}class Q{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:t},parts:i}=this._$AD,n=(e?.creationScope??E).importNode(t,!0);U.currentNode=n;let s=U.nextNode(),r=0,o=0,a=i[0];for(;void 0!==a;){if(r===a.index){let t;2===a.type?t=new J(s,s.nextSibling,this,e):1===a.type?t=new a.ctor(s,a.name,a.strings,this,e):6===a.type&&(t=new ne(s,this,e)),this._$AV.push(t),a=i[++o]}r!==a?.index&&(s=U.nextNode(),r++)}return U.currentNode=E,n}p(e){let t=0;for(const i of this._$AV)void 0!==i&&(void 0!==i.strings?(i._$AI(e,i,t),t+=i.strings.length-2):i._$AI(e[t])),t++}}class J{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(e,t,i,n){this.type=2,this._$AH=q,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=i,this.options=n,this._$Cv=n?.isConnected??!0}get parentNode(){let e=this._$AA.parentNode;const t=this._$AM;return void 0!==t&&11===e?.nodeType&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=X(this,e,t),T(e)?e===q||null==e||""===e?(this._$AH!==q&&this._$AR(),this._$AH=q):e!==this._$AH&&e!==N&&this._(e):void 0!==e._$litType$?this.$(e):void 0!==e.nodeType?this.T(e):(e=>P(e)||"function"==typeof e?.[Symbol.iterator])(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==q&&T(this._$AH)?this._$AA.nextSibling.data=e:this.T(E.createTextNode(e)),this._$AH=e}$(e){const{values:t,_$litType$:i}=e,n="number"==typeof i?this._$AC(e):(void 0===i.el&&(i.el=Z.createElement(K(i.h,i.h[0]),this.options)),i);if(this._$AH?._$AD===n)this._$AH.p(t);else{const e=new Q(n,this),i=e.u(this.options);e.p(t),this.T(i),this._$AH=e}}_$AC(e){let t=W.get(e.strings);return void 0===t&&W.set(e.strings,t=new Z(e)),t}k(e){P(this._$AH)||(this._$AH=[],this._$AR());const t=this._$AH;let i,n=0;for(const s of e)n===t.length?t.push(i=new J(this.O(z()),this.O(z()),this,this.options)):i=t[n],i._$AI(s),n++;n<t.length&&(this._$AR(i&&i._$AB.nextSibling,n),t.length=n)}_$AR(e=this._$AA.nextSibling,t){for(this._$AP?.(!1,!0,t);e!==this._$AB;){const t=S(e).nextSibling;S(e).remove(),e=t}}setConnected(e){void 0===this._$AM&&(this._$Cv=e,this._$AP?.(e))}}class G{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,i,n,s){this.type=1,this._$AH=q,this._$AN=void 0,this.element=e,this.name=t,this._$AM=n,this.options=s,i.length>2||""!==i[0]||""!==i[1]?(this._$AH=Array(i.length-1).fill(new String),this.strings=i):this._$AH=q}_$AI(e,t=this,i,n){const s=this.strings;let r=!1;if(void 0===s)e=X(this,e,t,0),r=!T(e)||e!==this._$AH&&e!==N,r&&(this._$AH=e);else{const n=e;let o,a;for(e=s[0],o=0;o<s.length-1;o++)a=X(this,n[i+o],t,o),a===N&&(a=this._$AH[o]),r||=!T(a)||a!==this._$AH[o],a===q?e=q:e!==q&&(e+=(a??"")+s[o+1]),this._$AH[o]=a}r&&!n&&this.j(e)}j(e){e===q?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class ee extends G{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===q?void 0:e}}class te extends G{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==q)}}class ie extends G{constructor(e,t,i,n,s){super(e,t,i,n,s),this.type=5}_$AI(e,t=this){if((e=X(this,e,t,0)??q)===N)return;const i=this._$AH,n=e===q&&i!==q||e.capture!==i.capture||e.once!==i.once||e.passive!==i.passive,s=e!==q&&(i===q||n);n&&this.element.removeEventListener(this.name,this,i),s&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){"function"==typeof this._$AH?this._$AH.call(this.options?.host??this.element,e):this._$AH.handleEvent(e)}}class ne{constructor(e,t,i){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=i}get _$AU(){return this._$AM._$AU}_$AI(e){X(this,e)}}const se=x.litHtmlPolyfillSupport;se?.(Z,J),(x.litHtmlVersions??=[]).push("3.3.2");const re=globalThis;class oe extends w{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){const e=super.createRenderRoot();return this.renderOptions.renderBefore??=e.firstChild,e}update(e){const t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=((e,t,i)=>{const n=i?.renderBefore??t;let s=n._$litPart$;if(void 0===s){const e=i?.renderBefore??null;n._$litPart$=s=new J(t.insertBefore(z(),e),e,void 0,i??{})}return s._$AI(e),s})(t,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return N}}oe._$litElement$=!0,oe.finalized=!0,re.litElementHydrateSupport?.({LitElement:oe});const ae=re.litElementPolyfillSupport;ae?.({LitElement:oe}),(re.litElementVersions??=[]).push("4.2.2");const le="fileList",ce=["bicycle","bird","bus","car","cat","dog","motorcycle","person","truck","visitor"],de=!0,he=!1,pe="/config/www/",ue=!0,me=[],ge="0px",_e="0px";class ve extends oe{static get properties(){return{_hass:{},config:{},_liveSelectedCamera:{type:String},_objectFilters:{type:Array},_pendingScrollToI:{type:Number},_previewOpen:{type:Boolean},_selectedDay:{type:String},_selectedIndex:{type:Number},_selectedSet:{type:Object},_selectMode:{type:Boolean},_showBulkHint:{type:Boolean},_showDatePicker:{type:Boolean},_showLivePicker:{type:Boolean},_showLiveQuickSwitch:{type:Boolean},_showNav:{type:Boolean},_suppressNextThumbClick:{type:Boolean},_swipeStartX:{type:Number},_swipeStartY:{type:Number},_swipeCurX:{type:Number},_swipeCurY:{type:Number},_swiping:{type:Boolean},_thumbMenuItem:{type:Object},_thumbMenuOpen:{type:Boolean},_viewMode:{type:String},_liveMuted:{type:Boolean},_liveFullscreen:{type:Boolean},_imgFsOpen:{type:Boolean},_aspectRatio:{type:String},_liveMicActive:{type:Boolean},_hamburgerOpen:{type:Boolean},_filterVideo:{type:Boolean},_filterImage:{type:Boolean}}}static getConfigElement(){return document.createElement("camera-gallery-card-editor")}static getStubConfig(e){const t=e?.states??{},i=Object.keys(t).find(e=>e.startsWith("camera.")&&"unavailable"!==t[e]?.state);return{source_mode:"sensor",entities:[],live_enabled:!0,live_camera_entity:i??"",thumb_size:140,bar_position:"top",object_filters:me}}constructor(){super(),this._previewMediaKey="",this._previewVideoEl=null,this._prefetchKey="",this._selectedPreviewSrc="",this._deleted=new Set,this._forceThumbReset=!1,this._liveCard=null,this._liveCardConfigKey="",this._liveWarmedUp=!1,this._signedWsPath=null,this._signedWsPathTs=0,this._autoAspectVideo=null,this._autoAspectObs=null,this._liveQuickSwitchTimer=null,this._navHideT=null,this._objectFilters=[],this._filterVideo=!1,this._filterImage=!1,this._pendingScrollToI=null,this._posterCache=new Map,this._msBrowseTtlCache=new Map,this._posterPending=new Set,this._posterFailed=new Set,this._snapshotCache=new Map,this._frigateSnapshots=[],this._objectCache=new Map,this._previewOpen=!1,this._selectMode=!1,this._selectedSet=new Set,this._showBulkHint=!1,this._bulkHintTimer=null,this._showDatePicker=!1,this._datePickerDays=null,this._showLivePicker=!1,this._showLiveQuickSwitch=!1,this._showNav=!1,this._pillsVisible=!1,this._pillsHovered=!1,this._pillsTimer=null,this._pillsHideActive=!1,this._srcEntityMap=new Map,this._suppressNextThumbClick=!1,this._swipeStartX=0,this._swipeStartY=0,this._swipeCurX=0,this._swipeCurY=0,this._swiping=!1,this._thumbLongPressStartX=0,this._thumbLongPressStartY=0,this._thumbLongPressTimer=null,this._thumbMenuItem=null,this._thumbMenuOpen=!1,this._thumbMenuOpenedAt=0,this._viewMode="media",this._liveSelectedCamera="",this._liveMuted=!1,this._liveFullscreen=!1,this._imgFsOpen=!1,this._hamburgerOpen=!1,this._zoomScale=1,this._zoomPanX=0,this._zoomPanY=0,this._zoomPinchDist=0,this._zoomPinchScale=1,this._zoomIsPinching=!1,this._zoomIsPanning=!1,this._zoomPanStartX=0,this._zoomPanStartY=0,this._zoomPanBaseX=0,this._zoomPanBaseY=0,this._onFullscreenChange=()=>{document.fullscreenElement===this||document.webkitFullscreenElement===this?(this.setAttribute("data-live-fs",""),this._showPills()):document.fullscreenElement||document.webkitFullscreenElement||(this.removeAttribute("data-live-fs"),this._liveFullscreen=!1,this._resetZoom()),this.requestUpdate()},this._onZoomTouchStart=e=>{if(this._isLiveActive()||this._previewOpen)if(2===e.touches.length){e.preventDefault(),this._zoomIsPinching=!0,this._zoomIsPanning=!1;const t=e.touches;this._zoomPinchDist=Math.hypot(t[1].clientX-t[0].clientX,t[1].clientY-t[0].clientY),this._zoomPinchScale=this._zoomScale}else 1===e.touches.length&&this._zoomScale>1&&(e.preventDefault(),this._zoomIsPanning=!0,this._zoomIsPinching=!1,this._zoomPanStartX=e.touches[0].clientX,this._zoomPanStartY=e.touches[0].clientY,this._zoomPanBaseX=this._zoomPanX,this._zoomPanBaseY=this._zoomPanY)},this._onZoomTouchMove=e=>{if(this._isLiveActive()||this._previewOpen)if(this._zoomIsPinching&&e.touches.length>=2){e.preventDefault();const t=e.touches,i=Math.hypot(t[1].clientX-t[0].clientX,t[1].clientY-t[0].clientY);this._zoomScale=Math.max(1,Math.min(5,this._zoomPinchScale*(i/this._zoomPinchDist))),this._zoomScale<=1?(this._zoomPanX=0,this._zoomPanY=0):this._clampZoomPan(),this._applyZoom()}else this._zoomIsPanning&&1===e.touches.length&&this._zoomScale>1&&(e.preventDefault(),this._zoomPanX=this._zoomPanBaseX+(e.touches[0].clientX-this._zoomPanStartX),this._zoomPanY=this._zoomPanBaseY+(e.touches[0].clientY-this._zoomPanStartY),this._clampZoomPan(),this._applyZoom())},this._onZoomTouchEnd=e=>{e.touches.length<2&&(this._zoomIsPinching=!1),0===e.touches.length&&(this._zoomIsPanning=!1),this._zoomScale<1.05&&this._resetZoom()},this._onZoomMouseDown=e=>{!this._isLiveActive()&&!this._previewOpen||this._zoomScale<=1||(e.preventDefault(),this._zoomIsPanning=!0,this._zoomPanStartX=e.clientX,this._zoomPanStartY=e.clientY,this._zoomPanBaseX=this._zoomPanX,this._zoomPanBaseY=this._zoomPanY)},this._onZoomMouseMove=e=>{this._zoomIsPanning&&(e.preventDefault(),this._zoomPanX=this._zoomPanBaseX+(e.clientX-this._zoomPanStartX),this._zoomPanY=this._zoomPanBaseY+(e.clientY-this._zoomPanStartY),this._clampZoomPan(),this._applyZoom())},this._onZoomMouseUp=()=>{this._zoomIsPanning=!1},this._onZoomWheel=e=>{if(!this._isLiveActive()&&!this._previewOpen)return;const t=this._getZoomHost();if(!t)return;const i=t.getBoundingClientRect();if(e.clientX<i.left||e.clientX>i.right||e.clientY<i.top||e.clientY>i.bottom)return;e.preventDefault();const n=e.deltaY>0?.9:1.1,s=this._zoomScale,r=Math.max(1,Math.min(5,s*n));if(r!==s){const t=i.left+i.width/2-this._zoomPanX,n=i.top+i.height/2-this._zoomPanY,o=r/s;this._zoomPanX=(e.clientX-t)*(1-o)+this._zoomPanX*o,this._zoomPanY=(e.clientY-n)*(1-o)+this._zoomPanY*o,this._zoomScale=r}this._zoomScale<=1?(this._zoomPanX=0,this._zoomPanY=0):this._clampZoomPan(),this._applyZoom()},this._ms={key:"",list:[],loadedAt:0,loading:!1,roots:[],urlCache:new Map},this._msResolveInFlight=!1,this._msResolveQueued=new Set,this._msResolveFailed=new Set,this._previewLoadTimer=null,this._posterQueue=[],this._posterQueued=new Set,this._posterInFlight=new Set,this._revealedThumbs=new Set,this._thumbObserver=null,this._thumbObserverRoot=null,this._observedThumbs=new WeakSet}_startMediaPoll(){this._stopMediaPoll(),"media"!==this.config?.source_mode&&"combined"!==this.config?.source_mode||(this._msEnsureLoaded(),this._mediaPollInterval=setInterval(()=>{this._ms.loadedAt=0,this._msEnsureLoaded()},3e4))}_stopMediaPoll(){this._mediaPollInterval&&(clearInterval(this._mediaPollInterval),this._mediaPollInterval=null)}connectedCallback(){super.connectedCallback(),document.addEventListener("fullscreenchange",this._onFullscreenChange),document.addEventListener("webkitfullscreenchange",this._onFullscreenChange),this.addEventListener("touchstart",this._onZoomTouchStart,{passive:!1}),this.addEventListener("touchmove",this._onZoomTouchMove,{passive:!1}),this.addEventListener("touchend",this._onZoomTouchEnd),this.addEventListener("touchcancel",this._onZoomTouchEnd),this.addEventListener("wheel",this._onZoomWheel,{passive:!1}),this.addEventListener("mousedown",this._onZoomMouseDown),window.addEventListener("mousemove",this._onZoomMouseMove),window.addEventListener("mouseup",this._onZoomMouseUp),navigator.maxTouchPoints>0&&this._showPills(5e3),this._startMediaPoll()}disconnectedCallback(){super.disconnectedCallback(),document.removeEventListener("fullscreenchange",this._onFullscreenChange),document.removeEventListener("webkitfullscreenchange",this._onFullscreenChange),this.removeEventListener("touchstart",this._onZoomTouchStart),this.removeEventListener("touchmove",this._onZoomTouchMove),this.removeEventListener("touchend",this._onZoomTouchEnd),this.removeEventListener("touchcancel",this._onZoomTouchEnd),this.removeEventListener("wheel",this._onZoomWheel),this.removeEventListener("mousedown",this._onZoomMouseDown),window.removeEventListener("mousemove",this._onZoomMouseMove),window.removeEventListener("mouseup",this._onZoomMouseUp),document.fullscreenElement&&document.exitFullscreen().catch(()=>{}),this._stopMediaPoll(),this._liveQuickSwitchTimer&&clearTimeout(this._liveQuickSwitchTimer),this._navHideT&&clearTimeout(this._navHideT),this._bulkHintTimer&&clearTimeout(this._bulkHintTimer),this._micErrorTimer&&clearTimeout(this._micErrorTimer),this._liveQuickSwitchTimer=null,this._navHideT=null,this._bulkHintTimer=null,this._micErrorTimer=null,this._clearPreviewVideoHostPlayback(),this._clearThumbLongPress(),this._thumbObserver&&(this._thumbObserver.disconnect(),this._thumbObserver=null),this._stopMicStream()}set hass(e){const t=!this._hass,i=this._hass;if(this._hass=e,t)return"live"===this.config?.start_mode&&this._hasLiveConfig()&&(this._viewMode="live"),void this.requestUpdate();this._liveCard&&(this._liveCard.hass=e);const n=this._sensorEntityList(),s=Array.isArray(this.config?.live_camera_entities)?this.config.live_camera_entities:[],r=(this.config?.menu_buttons??[]).map(e=>e.entity).filter(Boolean),o=[...n,...s,...r];o.length>0&&!o.some(t=>i?.states[t]!==e.states[t])||this.requestUpdate()}get hass(){return this._hass}_syncPreviewPlaybackFromState(){if(!this._hass||!this.config)return;const e="media"===this.config?.source_mode||"combined"===this.config?.source_mode,t=this._items();if(!t.length)return void this._clearPreviewVideoHostPlayback();const i=t.map((e,t)=>{const i=this._dtMsFromSrc(e);return{dayKey:this._extractDayKey(e),dtMs:i,idx:t,src:e}});i.sort((e,t)=>{const i=Number.isFinite(e.dtMs),n=Number.isFinite(t.dtMs);return i&&n&&t.dtMs!==e.dtMs?t.dtMs-e.dtMs:i&&!n?-1:!i&&n?1:t.idx-e.idx});const n=i.map(e=>({dayKey:e.dayKey,src:e.src})),s=this._uniqueDays(n)[0]??null,r=this._selectedDay??s,o=r?n.filter(e=>e.dayKey===r):n,a=o.filter(e=>this._matchesObjectFilter(e.src)&&this._matchesTypeFilter(e.src)),l=this._normMaxMedia(this.config?.max_media),c=a.slice(0,Math.min(l,a.length));if(!c.length)return void this._clearPreviewVideoHostPlayback();const d=Math.min(Math.max(this._selectedIndex??0,0),Math.max(0,c.length-1)),h=c[d]?.src||"";if(!h)return void this._clearPreviewVideoHostPlayback();this._syncCurrentMedia(h);let p=h;this._isMediaSourceId(h)&&(p=this._ms?.urlCache?.get(h)||"");let u="",m="",g="";if(e&&this._isMediaSourceId(h)){const e=this._msMetaById(h);u=e.mime,m=e.cls,g=e.title}const _=!!h&&this._isVideoSmart(p||g,u,m),v=!!!this.config?.clean_mode||!!this._previewOpen,b=!!h&&e&&this._isMediaSourceId(h),f=!(!h||b&&!p),y=JSON.stringify({selected:h,selectedUrl:p,selectedIsVideo:_,previewOpen:v,selectedHasUrl:f,isLive:this._isLiveActive()});this._previewMediaKey!==y&&(this._previewMediaKey=y,v&&!this._isLiveActive()&&f&&_?this._ensurePreviewVideoHostPlayback(p):this._clearPreviewVideoHostPlayback())}_enqueuePoster(e){const t=String(e||"").trim();t&&(this._posterCache.has(t)||this._posterPending.has(t)||this._posterQueued.has(t)||this._posterInFlight.has(t)||this._posterFailed.has(t)||(this._posterQueued.add(t),this._posterQueue.push(t),this._posterQueue.length>100&&(this._posterQueue.length=100),this._drainPosterQueue()))}_drainPosterQueue(){for(;this._posterInFlight.size<8&&this._posterQueue.length;){const e=this._posterQueue.pop();this._posterQueued.delete(e),e&&(this._posterCache.has(e)||this._posterPending.has(e)||this._posterInFlight.has(e)||this._posterFailed.has(e)||(this._posterInFlight.add(e),this._ensurePoster(e).catch(()=>{}).finally(()=>{this._posterInFlight.delete(e),this._drainPosterQueue()})))}}_resetPosterQueue(){this._posterQueue=[],this._posterQueued.clear(),this._posterInFlight.clear(),this._posterPending.clear(),this._posterFailed.clear()}_queueSensorPosterWork(e){if(Array.isArray(e)&&e.length&&("sensor"===this.config?.source_mode||"combined"===this.config?.source_mode))for(const t of e){const e=String(t?.src||"");e&&(this._isVideo(e)&&this._enqueuePoster(e))}}_ensurePreviewVideoHostPlayback(e){const t=this.renderRoot?.querySelector("#preview-video-host");if(!t||!e)return;let i=this._previewVideoEl;i&&i.parentElement===t||(t.innerHTML="",i=document.createElement("video"),i.className="pimg",i.controls=!0,i.playsInline=!0,i.preload="metadata",t.appendChild(i),this._previewVideoEl=i);const n=!0===this.config?.autoplay,s=void 0===this.config?.auto_muted||!0===this.config.auto_muted;if(i.autoplay=n,i.muted=s,i.src!==e){i.src=e;const t=this._posterCache.get(e)||"";if(t)i.poster=t;else{i.removeAttribute("poster");const t=e;i.addEventListener("canplay",()=>{this._posterCache.has(t)||this._enqueuePoster(t)},{once:!0})}n&&i.addEventListener("canplay",()=>{i.muted=s,i.play().catch(()=>{})},{once:!0});try{i.load()}catch(e){}}else{const t=this._posterCache.get(e)||"";t&&i.poster!==t&&(i.poster=t)}}_clearPreviewVideoHostPlayback(){const e=this.renderRoot?.querySelector("#preview-video-host");if(this._previewVideoEl){try{this._previewVideoEl.pause()}catch(e){}this._previewVideoEl.removeAttribute("src"),this._previewVideoEl.removeAttribute("poster");try{this._previewVideoEl.load()}catch(e){}}this._previewVideoEl=null,this._previewMediaKey="",e&&(e.innerHTML="")}_buildFilenameDateRegex(e){const t=String(e||"").trim();if(!t)return null;const i=/(YYYY|YY|MM|DD|HH|mm|ss)/g,n=e=>e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");let s="",r=0;const o=[];let a;for(;null!==(a=i.exec(t));){const e=a[0],i=a.index;i>r&&(s+=n(t.slice(r,i))),"YYYY"===e?(s+="(\\d{4})",o.push("year")):"YY"===e?(s+="(\\d{2})",o.push("year2")):"MM"===e?(s+="(\\d{2})",o.push("month")):"DD"===e?(s+="(\\d{2})",o.push("day")):"HH"===e?(s+="(\\d{2})",o.push("hour")):"mm"===e?(s+="(\\d{2})",o.push("minute")):"ss"===e&&(s+="(\\d{2})",o.push("second")),r=i+e.length}return r<t.length&&(s+=n(t.slice(r))),o.length?{regex:new RegExp(s),fields:o}:null}_scheduleVisibleMediaWork(e,t,i,n){const s=String(e||""),r=this._normMaxMedia(this.config?.max_media),o=this._getThumbRenderLimit(r,n),a=n?t.slice(0,o).map(e=>String(e?.src||"")).filter(e=>e&&this._isMediaSourceId(e)):[],l=JSON.stringify({selectedSrc:s,visibleThumbIds:a,usingMediaSource:!!n}),c=n&&s&&this._isMediaSourceId(s)&&!this._ms.urlCache.has(s);(this._prefetchKey!==l||c)&&(this._prefetchKey=l,queueMicrotask(()=>{if(this.isConnected){if(n){const e=[];if(s&&this._isMediaSourceId(s)&&e.push(s),this._hasFrigateSource())for(const t of a){if(t===s)continue;const i=this._findMatchingSnapshotMediaId(t);!i||this._ms.urlCache.has(i)||this._msResolveFailed.has(i)||e.push(i)}for(const t of a)t!==s&&e.push(t);e.length&&this._msQueueResolve(e)}this._selectedPreviewSrc=s}}))}_normalizeEntityFilterMap(e){const t={},i=new Set(ce.map(e=>String(e).toLowerCase()));if(!e||"object"!=typeof e||Array.isArray(e))return t;for(const[n,s]of Object.entries(e)){const e=String(n||"").trim(),r=String(s||"").toLowerCase().trim();e&&r&&i.has(r)&&(t[e]=r)}return t}_parseRawDateFields(e,t){if(!e||!t)return null;try{const i=this._buildFilenameDateRegex(t);if(!i?.regex||!i?.fields?.length)return null;const n=String(e).match(i.regex);if(!n)return null;const s={year:null,month:null,day:null,hour:null,minute:null,second:null};return i.fields.forEach((e,t)=>{const i=n[t+1];null!=i&&("year"===e?s.year=Number(i):"year2"===e?s.year=2e3+Number(i):"month"===e?s.month=Number(i):"day"===e?s.day=Number(i):"hour"===e?s.hour=Number(i):"minute"===e?s.minute=Number(i):"second"===e&&(s.second=Number(i)))}),s}catch(e){return null}}_parseFolderFileDatetime(e){const t=this.config?.folder_datetime_format,i=this.config?.filename_datetime_format;if(!t)return null;const n=String(e||"").split("/").filter(Boolean);if(n.length<2)return null;const s=n[n.length-1].replace(/\.[^./.]+$/,""),r=n[n.length-2],o=this._parseRawDateFields(r,t);if(!o)return null;const a=i?this._parseRawDateFields(s,i):null,l=o.year??a?.year??(new Date).getFullYear(),c=o.month??a?.month??null,d=o.day??a?.day??null,h=a?.hour??o.hour??0,p=a?.minute??o.minute??0,u=a?.second??o.second??0;if(null==c||null==d)return null;if(c<1||c>12||d<1||d>31)return null;const m=new Date(l,c-1,d,h,p,u).getTime();if(!Number.isFinite(m))return null;const g=(e,t=2)=>String(e).padStart(t,"0"),_=`${g(l,4)}-${g(c)}-${g(d)}T${g(h)}:${g(p)}:${g(u)}`;return{dayKey:`${g(l,4)}-${g(c)}-${g(d)}`,dtKey:_,ms:m}}_autoDetectFolderDate(e){const t=String(e||"").trim(),i=(new Date).getFullYear();let n;if(n=t.match(/^(\d{4})[_\-.](\d{2})[_\-.](\d{2})$/),n){const e=+n[1],t=+n[2],i=+n[3];if(t>=1&&t<=12&&i>=1&&i<=31)return{year:e,month:t,day:i}}if(n=t.match(/^(\d{2})[_\-.](\d{2})[_\-.](\d{4})$/),n){const e=+n[1],t=+n[2],i=+n[3];if(t>=1&&t<=12&&e>=1&&e<=31)return{year:i,month:t,day:e}}if(n=t.match(/^(\d{4})(\d{2})(\d{2})$/),n){const e=+n[1],t=+n[2],i=+n[3];if(t>=1&&t<=12&&i>=1&&i<=31)return{year:e,month:t,day:i}}if(n=t.match(/^(\d{2})(\d{2})$/),n){const e=+n[1],t=+n[2];if(t>=1&&t<=12&&e>=1&&e<=31)return{year:i,month:t,day:e};if(e>=1&&e<=12&&t>=1&&t<=31)return{year:i,month:e,day:t}}return null}_autoDetectFileTime(e){const t=String(e||"").trim();let i;if(i=t.match(/(?:^|[^0-9])(\d{2})[:_-](\d{2})[:_-](\d{2})(?:[^0-9]|$)/),i){const e=+i[1],t=+i[2],n=+i[3];if(e<=23&&t<=59&&n<=59)return{hour:e,minute:t,second:n}}if(i=t.match(/^\d{6}$/),i){const e=+t.slice(0,2),i=+t.slice(2,4),n=+t.slice(4,6);if(e<=23&&i<=59&&n<=59)return{hour:e,minute:i,second:n}}return null}_autoDetectFolderFileDate(e){const t=String(e||"").split("/").filter(Boolean);if(t.length<2)return null;const i=t[t.length-1].replace(/\.[^./.]+$/,""),n=t[t.length-2],s=this._autoDetectFolderDate(n);if(!s)return null;const r=this._autoDetectFileTime(i),{year:o,month:a,day:l}=s,c=r?.hour??0,d=r?.minute??0,h=r?.second??0,p=new Date(o,a-1,l,c,d,h).getTime();if(!Number.isFinite(p))return null;const u=(e,t=2)=>String(e).padStart(t,"0"),m=`${u(o,4)}-${u(a)}-${u(l)}T${u(c)}:${u(d)}:${u(h)}`;return{dayKey:`${u(o,4)}-${u(a)}-${u(l)}`,dtKey:m,ms:p}}_parseDateFromFilename(e,t){const i=this._sourceNameForParsing(e);if(!i||!t)return null;try{const e=this._buildFilenameDateRegex(t);if(!e?.regex||!e?.fields?.length)return null;const n=String(i).match(e.regex);if(!n)return null;let s=null,r=null,o=null,a=0,l=0,c=0;if(e.fields.forEach((e,t)=>{const i=n[t+1];null!=i&&("year"===e&&(s=Number(i)),"year2"===e&&(s=2e3+Number(i)),"month"===e&&(r=Number(i)),"day"===e&&(o=Number(i)),"hour"===e&&(a=Number(i)),"minute"===e&&(l=Number(i)),"second"===e&&(c=Number(i)))}),!Number.isFinite(s)||!Number.isFinite(r)||!Number.isFinite(o))return null;if(r<1||r>12)return null;if(o<1||o>31)return null;if(a<0||a>23)return null;if(l<0||l>59)return null;if(c<0||c>59)return null;const d=String(s).padStart(4,"0"),h=String(r).padStart(2,"0"),p=String(o).padStart(2,"0"),u=String(a).padStart(2,"0"),m=String(l).padStart(2,"0"),g=`${d}-${h}-${p}T${u}:${m}:${String(c).padStart(2,"0")}`,_=new Date(g).getTime();return Number.isFinite(_)?{dayKey:`${d}-${h}-${p}`,dtKey:g,ms:_}:null}catch(e){return null}}_getAllLiveCameraEntities(){const e=this._hass?.states||{},t=this.config?.live_camera_entities;return t?.length?Object.keys(e).filter(e=>e.startsWith("camera.")).filter(i=>!!e[i]&&!!t.includes(i)).sort((e,t)=>{const i=this._friendlyCameraName(e).toLowerCase(),n=this._friendlyCameraName(t).toLowerCase();return i.localeCompare(n,this._locale())}):[]}_configChangedKeys(e={},t={}){const i=new Set([...Object.keys(e||{}),...Object.keys(t||{})]);return Array.from(i).filter(i=>!this._jsonEq(e?.[i],t?.[i]))}_thumbCanMultipleDelete(){const e=this.config?.source_mode;return("sensor"===e||"combined"===e)&&(!(!this.config?.allow_delete||!this.config?.allow_bulk_delete)&&!!this._serviceParts())}_friendlyCameraName(e){const t=String(e||"").trim();if(!t)return"";if(t.startsWith("__cgc_stream")){const e=this._getStreamEntryById(t);return e?e.name:"Stream"}const i=this._hass?.states?.[t],n=String(i?.attributes?.friendly_name||"").trim();if(n)return n;const s=(t.split(".").pop()||t).replace(/_/g," ").trim();return s?s.charAt(0).toUpperCase()+s.slice(1):t}_isThumbLayoutVertical(){return"vertical"===this.config?.thumb_layout}_jsonEq(e,t){return JSON.stringify(e)===JSON.stringify(t)}_locale(){const e=this._hass?.locale;return"string"==typeof e&&e.trim()?e.trim():e&&"object"==typeof e&&"string"==typeof e.language&&e.language.trim()?e.language.trim():"string"==typeof this._hass?.language&&this._hass.language.trim()?this._hass.language.trim():"undefined"!=typeof navigator&&navigator.language?navigator.language:void 0}_useAmPm(){const e=this._hass?.locale?.time_format;if("24"===e)return!1;if("12"===e)return!0;try{const t="language"===e?this._locale():void 0,i=(new Date).toLocaleString(t);return/AM|PM/i.test(i)}catch(e){return!1}}_pathHasClass(e=[],t=""){return e.some(e=>e?.classList?.contains(t))}_showNavChevrons(){this._showNav=!0,this.requestUpdate(),this._navHideT&&clearTimeout(this._navHideT),this._navHideT=setTimeout(()=>{this._showNav=!1,this.requestUpdate()},2500)}_showPills(e=2500){if(this._pillsVisible=!0,this.config?.persistent_controls||this._pillsHovered)return clearTimeout(this._pillsTimer),this._pillsTimer=null,this._pillsHideActive=!1,void this.requestUpdate();this._pillsHideActive||(clearTimeout(this._pillsTimer),this._pillsTimer=setTimeout(()=>{this._pillsHideActive=!1,this._showLivePicker||this.config?.persistent_controls||this._pillsHovered||this._hamburgerOpen||(this._pillsVisible=!1,this.requestUpdate())},e)),this.requestUpdate()}_showPillsHover(){this._pillsHovered=!0,this._pillsHideActive=!1,clearTimeout(this._pillsTimer),this._pillsTimer=null,this._pillsVisible=!0,this.requestUpdate()}_hidePillsHover(){this._pillsHovered=!1,this._showLivePicker||this.config?.persistent_controls||(clearTimeout(this._pillsTimer),this._pillsHideActive=!0,this._pillsTimer=setTimeout(()=>{this._pillsHideActive=!1,this._showLivePicker||this._pillsHovered||this._hamburgerOpen||(this._pillsVisible=!1,this.requestUpdate())},200))}_hideBulkDeleteHint(){this._bulkHintTimer&&(clearTimeout(this._bulkHintTimer),this._bulkHintTimer=null),this._showBulkHint&&(this._showBulkHint=!1,this.requestUpdate())}_showBulkDeleteHint(){this._bulkHintTimer&&(clearTimeout(this._bulkHintTimer),this._bulkHintTimer=null),this._showBulkHint=!0,this.requestUpdate(),this._bulkHintTimer=setTimeout(()=>{this._showBulkHint=!1,this._bulkHintTimer=null,this.requestUpdate()},5e3)}_getVisibleObjectFilters(){return Array.isArray(this.config?.object_filters)?this.config.object_filters:[]}_hasLiveConfig(){return!!this.config?.live_enabled&&(this._getStreamEntries().length>0||this._getLiveCameraOptions().length>0)}_isLiveActive(){return this._hasLiveConfig()&&"live"===this._viewMode}_isSourceConfigChange(e=[]){const t=new Set(["allow_bulk_delete","allow_delete","delete_confirm","delete_service","entities","entity","frigate_url","max_media","media_source","media_sources","source_mode","thumbnail_frame_pct"]);return e.some(e=>t.has(e))}_isUiOnlyConfigChange(e=[]){if(!e.length)return!1;const t=new Set(["bar_opacity","bar_position","live_camera_entity","live_cameras","live_default_camera","live_enabled","object_filters","clean_mode","preview_close_on_tap","preview_position","pill_size","thumb_bar_position","thumb_layout","thumb_size","show_camera_title","controls_mode"]);return e.every(e=>t.has(e))}_normMaxMedia(e){const t=Number(String(e??"").trim());return Number.isFinite(t)?Math.max(1,Math.min(500,Math.round(t))):50}_normPrefixHardcoded(){const e=(pe.startsWith("/")?pe:"/"+pe).replace(/\/{2,}/g,"/");return e.endsWith("/")?e:e+"/"}_normPreviewPosition(e){return"bottom"===String(e||"").toLowerCase().trim()?"bottom":"top"}_normSourceMode(e){const t=String(e||"").toLowerCase().trim();return"media"===t?"media":"combined"===t?"combined":"sensor"}_normThumbBarPosition(e){const t=String(e||"").toLowerCase().trim();return"hidden"===t?"hidden":"top"===t?"top":"bottom"}_normThumbLayout(e){return"vertical"===String(e||"").toLowerCase().trim()?"vertical":"horizontal"}_normalizeVisibleObjectFilters(e){const t=Array.isArray(e)?e:e?[e]:[],i=[],n=new Set;this._customIcons={};for(const e of t){let t="",s="";if("string"==typeof e)t=e.toLowerCase().trim();else if("object"==typeof e&&null!==e){const i=Object.entries(e);i.length>0&&(t=i[0][0].toLowerCase().trim(),s=i[0][1])}if(t&&!n.has(t)&&(n.add(t),i.push(t),s&&(this._customIcons[t]=s),i.length>=9))break}return i}_sensorEntityList(){const e=(Array.isArray(this.config?.entities)?this.config.entities:[]).map(e=>String(e||"").trim()).filter(Boolean);if(e.length)return e;const t=String(this.config?.entity||"").trim();return t?[t]:[]}_sensorNormalizeEntities(e,t=""){const i=Array.isArray(e)?e:e?[e]:t?[t]:[],n=[],s=new Set;for(const e of i){const t=String(e??"").trim();if(!t)continue;const i=t.toLowerCase();s.has(i)||(s.add(i),n.push(t))}return n}_serviceParts(){const e=String(this.config?.delete_service||""),[t,i]=e.split(".");return t&&i?{domain:t,service:i}:null}_openDatePicker(e){this._datePickerDays=e,this._showDatePicker=!0,this.requestUpdate()}_closeDatePicker(){this._showDatePicker=!1,this._datePickerDays=null,this.requestUpdate()}_closeLivePicker(){this._showLivePicker=!1,this._liveCameraListCache=null,this.requestUpdate()}async _ensureLiveCard(){const e=this._getEffectiveLiveCamera();if(!e)return this._liveCard=null,this._liveCardConfigKey="",null;const t=`webrtc:${e}`;if(this._liveCard&&this._liveCardConfigKey===t)return this._liveCard.hass=this._hass,this._liveCard;await customElements.whenDefined("ha-camera-stream");const i=document.createElement("ha-camera-stream");return i.stateObj=this._hass?.states?.[e],i.hass=this._hass,i.muted=!0,i.controls=!1,i.style.cssText="display:block;width:100%;height:100%;margin:0;object-fit:cover;",this._liveCard=i,this._liveCardConfigKey=t,i}async _ensureLiveCardFromUrl(e){const t=`stream:${e}`;if(this._liveCard&&this._liveCardConfigKey===t)return this._liveCard;if(this._rtcWebSocket){try{this._rtcWebSocket.close()}catch(e){}this._rtcWebSocket=null}if(this._rtcPeerConnection){try{this._rtcPeerConnection.close()}catch(e){}this._rtcPeerConnection=null}const i=document.createElement("video");i.autoplay=!0,i.muted=!0,i.setAttribute("muted",""),i.playsInline=!0,i.controls=!1,i.style.cssText="display:block;width:100%;height:100%;margin:0;object-fit:cover;";try{const t=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});this._rtcPeerConnection=t,t.addTransceiver("video",{direction:"recvonly"}),t.addTransceiver("audio",{direction:"recvonly"}),t.ontrack=e=>{e.streams?.[0]&&(i.srcObject=e.streams[0])};const n=this._getGo2rtcUrl();let s;if(n){const t=n.replace(/^http/,"ws")+"/api/webrtc?src="+encodeURIComponent(e);s=new WebSocket(t)}else{const t=Date.now();if(!this._signedWsPath||t-this._signedWsPathTs>25e3){const e=await this._hass.callWS({type:"auth/sign_path",path:"/api/webrtc/ws"});this._signedWsPath=e.path,this._signedWsPathTs=t}const i="ws"+this._hass.hassUrl(this._signedWsPath).substring(4)+"&url="+encodeURIComponent(e);s=new WebSocket(i)}this._rtcWebSocket=s,await new Promise((e,i)=>{const n=setTimeout(()=>i(new Error("go2rtc WS timeout")),1e4);s.onopen=async()=>{try{const e=await t.createOffer();await t.setLocalDescription(e),s.send(JSON.stringify({type:"webrtc/offer",value:t.localDescription.sdp}))}catch(e){i(e)}},s.onmessage=async s=>{try{const r=JSON.parse(s.data);"webrtc/answer"===r.type?(await t.setRemoteDescription({type:"answer",sdp:r.value}),clearTimeout(n),e()):"webrtc/candidate"===r.type?t.addIceCandidate({candidate:r.value,sdpMid:"0"}).catch(()=>{}):"error"===r.type&&(clearTimeout(n),i(new Error("go2rtc error: "+r.value)))}catch(e){i(e)}},s.onerror=e=>{clearTimeout(n),i(new Error("go2rtc WS error"))},s.onclose=e=>{1e3!==e.code&&(clearTimeout(n),i(new Error("go2rtc WS closed: "+e.code)))}}),t.onicecandidate=e=>{e.candidate&&s.readyState===WebSocket.OPEN&&s.send(JSON.stringify({type:"webrtc/candidate",value:e.candidate.candidate}))}}catch(e){console.warn("[CGC] RTSP stream failed:",e)}return this._liveCard=i,this._liveCardConfigKey=t,i}_getGo2rtcUrl(){return String(this.config?.live_go2rtc_url||"").trim()}_getEffectiveLiveCamera(){const e=String(this._liveSelectedCamera||"").trim();if(e)return e;const t=this._getLiveCameraOptions(),i=String(this.config?.live_camera_entity||"").trim();return i&&t.includes(i)?i:t[0]||""}_getStreamEntries(){const e=this.config?.live_stream_urls;return Array.isArray(e)&&e.length>0?e.filter(e=>e&&String(e.url||"").trim()).map((e,t)=>({id:`__cgc_stream_${t}__`,url:String(e.url).trim(),name:String(e.name||"").trim()||`Stream ${t+1}`})):this.config?.live_stream_url?[{id:"__cgc_stream_0__",url:this.config.live_stream_url,name:this.config.live_stream_name||"Stream"}]:[]}_getStreamEntryById(e){const t=String(e||"");if(!t.startsWith("__cgc_stream"))return null;const i=this._getStreamEntries();return i.find(e=>e.id===t)||"__cgc_stream__"===t&&i[0]||null}_getLiveCameraOptions(){const e=this._getAllLiveCameraEntities(),t=this._getStreamEntries().map(e=>e.id);return[...t,...e]}_hideLiveQuickSwitchButton(){this._liveQuickSwitchTimer&&(clearTimeout(this._liveQuickSwitchTimer),this._liveQuickSwitchTimer=null),this._showLiveQuickSwitch=!1,this.requestUpdate()}_findLiveVideo(){const e=this.renderRoot?.querySelector("#live-card-host");if(!e)return null;const t=e=>{const i=e.querySelector("video");if(i)return i;for(const i of e.querySelectorAll("*"))if(i.shadowRoot){const e=t(i.shadowRoot);if(e)return e}return null};return t(e)}_setupAutoAspectRatio(){this._autoAspectObs&&(clearInterval(this._autoAspectObs),this._autoAspectObs=null),this._autoAspectVideo=null;const e=e=>{const t=e.videoWidth,i=e.videoHeight;if(!t||!i)return;const n=`${t}/${i}`;n!==this._aspectRatio&&(this._aspectRatio=n,this.requestUpdate())},t=()=>{const t=this._findLiveVideo();return t&&t!==this._autoAspectVideo?(this._autoAspectVideo=t,t.videoWidth&&t.videoHeight?e(t):t.addEventListener("loadedmetadata",()=>e(t),{once:!0}),!0):!!t};if(!t()){let e=0;this._autoAspectObs=setInterval(()=>{e+=500,(t()||e>=1e4)&&(clearInterval(this._autoAspectObs),this._autoAspectObs=null)},500)}}_parseAspectRatio(e){return{"16:9":"16/9","4:3":"4/3","1:1":"1/1"}[e]||"16/9"}_isLiveFullscreen(){return this._isLiveActive()&&(!!document.fullscreenElement||!!document.webkitFullscreenElement||!!this._liveFullscreen)}_resetZoom(){this._zoomScale=1,this._zoomPanX=0,this._zoomPanY=0,this._zoomIsPinching=!1,this._zoomIsPanning=!1,this._applyZoom()}_getZoomHost(){return this._isLiveActive()?this.renderRoot?.querySelector("#live-card-host"):this._previewOpen?this.renderRoot?.querySelector("#preview-video-host")??this.renderRoot?.querySelector(".pimg"):null}_clampZoomPan(){const e=this._getZoomHost();if(!e)return;const t=e.offsetWidth*(this._zoomScale-1)/2,i=e.offsetHeight*(this._zoomScale-1)/2;this._zoomPanX=Math.max(-t,Math.min(t,this._zoomPanX)),this._zoomPanY=Math.max(-i,Math.min(i,this._zoomPanY))}_applyZoom(){const e=this._getZoomHost(),t=this.renderRoot?.querySelector(".preview");e?this._zoomScale<=1?(e.style.transform="",e.style.transformOrigin="",this._isLiveActive()&&(e.style.cursor=""),t&&(t.style.touchAction="",t.style.cursor="")):(e.style.transformOrigin="center center",e.style.transform=`translate(${this._zoomPanX}px, ${this._zoomPanY}px) scale(${this._zoomScale})`,this._isLiveActive()&&(e.style.cursor=this._zoomIsPanning?"grabbing":"grab"),t&&(t.style.touchAction="none",t.style.cursor=this._zoomIsPanning?"grabbing":"grab")):t&&(t.style.touchAction="",t.style.cursor="")}_toggleLiveMute(){const e=!this._liveMuted;this._liveMuted=e,this._liveCard&&(this._liveCard.muted=e);const t=this._findLiveVideo();t&&(t.muted=e)}_toggleLiveFullscreen(){const e=this._findLiveVideo();document.fullscreenElement||document.webkitFullscreenElement?(document.exitFullscreen||document.webkitExitFullscreen).call(document).catch(()=>{}):e&&e.webkitSupportsFullscreen?e.webkitEnterFullscreen():document.fullscreenEnabled?this.requestFullscreen().catch(()=>{}):(this._liveFullscreen=!this._liveFullscreen,this._liveFullscreen||this._resetZoom(),this.toggleAttribute("data-live-fs",this._liveFullscreen),this.requestUpdate())}_openImageFullscreen(){this._imgFsOpen=!0;try{screen.orientation?.lock?.("landscape")}catch(e){}this._showPills(),this.requestUpdate()}_closeImageFullscreen(){this._imgFsOpen=!1;try{screen.orientation?.unlock?.()}catch(e){}this.requestUpdate()}_syncCurrentMedia(e){const t=this.config?.sync_entity;if(!t||!t.startsWith("input_text."))return;if(!e||e===this._lastSyncedSrc)return;this._lastSyncedSrc=e;const i=e.split("/").pop().split("?")[0];this._hass?.callService("input_text","set_value",{entity_id:t,value:i})}_applyLiveMuteState(){const e=this._liveMuted;this._liveCard&&(this._liveCard.muted=e);const t=this._findLiveVideo();return t&&(t.muted=e),!0}_syncLiveMuted(){this._applyLiveMuteState(),this._liveMuted||(setTimeout(()=>this._applyLiveMuteState(),2e3),setTimeout(()=>this._applyLiveMuteState(),5e3))}_stopMicStream(){if(this._micStream&&(this._micStream.getTracks().forEach(e=>e.stop()),this._micStream=null),this._micPeerConnection){try{this._micPeerConnection.close()}catch(e){}this._micPeerConnection=null}if(this._micWebSocket){try{this._micWebSocket.close()}catch(e){}this._micWebSocket=null}this._liveMicActive=!1}_showMicError(e){this._micErrorMsg=e,this.requestUpdate(),clearTimeout(this._micErrorTimer),this._micErrorTimer=setTimeout(()=>{this._micErrorMsg=null,this.requestUpdate()},8e3),console.error("[CGC] Mic error:",e);try{this._hass.callService("persistent_notification","create",{title:"CGC mic error",message:e,notification_id:"cgc_mic_error"})}catch(e){}}async _toggleMic(){if(this._liveMicActive)return void this._stopMicStream();const e=this.config?.live_go2rtc_stream;if(e)if(navigator.mediaDevices?.getUserMedia)try{const t=await navigator.mediaDevices.getUserMedia({audio:!0,video:!1});this._micStream=t;const i=await this._hass.callWS({type:"auth/sign_path",path:"/api/webrtc/ws"}),n="ws"+this._hass.hassUrl(i.path).substring(4)+"&url="+encodeURIComponent(e),s=new RTCPeerConnection({iceServers:[{urls:["stun:stun.cloudflare.com:3478","stun:stun.l.google.com:19302"]},{urls:["turn:openrelay.metered.ca:80","turn:openrelay.metered.ca:443","turns:openrelay.metered.ca:443?transport=tcp"],username:"openrelay",credential:"openrelay"}]});this._micPeerConnection=s;const r=t.getAudioTracks()[0];s.addTransceiver("video",{direction:"recvonly"}),s.addTransceiver(r,{direction:"sendonly"});const o=new WebSocket(n);this._micWebSocket=o,s.oniceconnectionstatechange=()=>console.log("[CGC] ICE state:",s.iceConnectionState),s.onconnectionstatechange=()=>console.log("[CGC] PC state:",s.connectionState),s.onicecandidate=e=>{if(o.readyState!==WebSocket.OPEN)return;const t=e.candidate?e.candidate.candidate:"";console.log("[CGC] Sending ICE:",t||"(end-of-candidates)"),o.send(JSON.stringify({type:"webrtc/candidate",value:t}))},await new Promise((e,t)=>{const i=setTimeout(()=>t(new Error("go2rtc mic WS timeout")),1e4);o.onopen=async()=>{try{const e=await s.createOffer();await s.setLocalDescription(e),console.log("[CGC] Offer SDP audio:",e.sdp.split("\n").filter(e=>e.startsWith("m=")||e.startsWith("a=rtpmap")||e.startsWith("a=sendonly")||e.startsWith("a=recvonly")).join(" | ")),o.send(JSON.stringify({type:"webrtc/offer",value:s.localDescription.sdp}))}catch(e){t(e)}},o.onmessage=async n=>{try{const r=JSON.parse(n.data);"webrtc/answer"===r.type?(console.log("[CGC] Answer SDP:",r.value),await s.setRemoteDescription({type:"answer",sdp:r.value}),clearTimeout(i),e()):"webrtc/candidate"===r.type?r.value&&s.addIceCandidate({candidate:r.value,sdpMid:"0"}).catch(()=>{}):"error"===r.type&&(clearTimeout(i),t(new Error("go2rtc mic error: "+r.value)))}catch(e){t(e)}},o.onerror=()=>{clearTimeout(i),t(new Error("go2rtc mic WS error"))},o.onclose=e=>{1e3!==e.code&&(clearTimeout(i),t(new Error("go2rtc mic WS closed: "+e.code)))}}),this._liveMicActive=!0,this.requestUpdate()}catch(e){console.warn("[CGC] Two-way audio failed:",e),this._showMicError("Mic mislukt: "+e.message),this._stopMicStream()}else this._showMicError("HTTPS vereist voor microfoon")}async _mountLiveCard(){if(!this._isLiveActive())return;const e=this.renderRoot?.querySelector("#live-card-host");if(!e)return;const t=this._getEffectiveLiveCamera(),i=this._getStreamEntryById(t),n=!!i,s=n?await this._ensureLiveCardFromUrl(i.url):await this._ensureLiveCard();if(!s)return;const r=s.parentElement!==e;if(r&&(e.innerHTML="",e.appendChild(s)),!n){const e=this._getEffectiveLiveCamera(),t=this._hass?.states?.[e];t?.last_changed!==s.stateObj?.last_changed&&(s.stateObj=t)}r&&(s.hass=this._hass,this._injectLiveFillStyle(s),this._liveMuted=!1!==this.config?.live_auto_muted,this._syncLiveMuted()),this._setupAutoAspectRatio()}async _warmupLiveCard(){if(!this._hasLiveConfig())return;const e=this.renderRoot?.querySelector("#live-card-host");if(!e)return;const t=this._getEffectiveLiveCamera(),i=this._getStreamEntryById(t),n=i?await this._ensureLiveCardFromUrl(i.url):await this._ensureLiveCard();n&&(n.parentElement!==e&&(e.innerHTML="",e.appendChild(n),n.hass=this._hass,this._injectLiveFillStyle(n),this._liveMuted=!1!==this.config?.live_auto_muted,this._syncLiveMuted()),this._setupAutoAspectRatio())}_injectLiveFillStyle(e){const t=e=>{const t=e.shadowRoot;if(!t||t.querySelector("#cgc-fill"))return;const i=document.createElement("style");i.id="cgc-fill",i.textContent="\n      :host { display:block!important; width:100%!important; height:100%!important; }\n      .image-container { width:100%!important; height:100%!important; }\n      .ratio { padding-bottom:0!important; padding-top:0!important; width:100%!important; height:100%!important; position:relative!important; }\n      img, video, ha-hls-player, ha-web-rtc-player, ha-camera-stream { width:100%!important; height:100%!important; object-fit:cover!important; display:block!important; position:static!important; }\n    ",t.appendChild(i);const n=t.querySelector(".ratio");n&&n.style.setProperty("padding-bottom","0","important")};t(e);const i=e=>{for(const n of e.querySelectorAll("*"))n.shadowRoot&&(t(n),i(n.shadowRoot))},n=()=>{const t=e.shadowRoot;return!!t&&(i(t),!0)};if(!n()){const t=new MutationObserver(()=>{n()&&t.disconnect()});t.observe(e.shadowRoot||e,{childList:!0,subtree:!0}),setTimeout(()=>t.disconnect(),5e3)}setTimeout(()=>{e.shadowRoot&&i(e.shadowRoot)},2e3)}_openLivePicker(){this._getLiveCameraOptions().length<=1||(this._liveCameraListCache=this._getLiveCameraOptions(),this._showLivePicker=!0,this.requestUpdate())}_renderLiveCardHost(){return B`<div id="live-card-host" class="live-card-host"></div>`}_renderLiveInner(){const e=this._getEffectiveLiveCamera();if(!!!this._getStreamEntryById(e)){const t=e;if(!t)return B`<div class="preview-empty">No live camera configured.</div>`;const i=this._hass?.states?.[t];if(!i)return B`<div class="preview-empty">Camera entity not found: ${t}</div>`;const n=i.state??"";if("unavailable"===n||"unknown"===n)return B`
          <div class="live-offline">
            ${B``}
            <div class="live-offline-badge">
              <ha-icon icon="mdi:camera-off"></ha-icon>
              <span>${this._friendlyCameraName(t)}</span>
              <span class="live-offline-state">Offline</span>
            </div>
          </div>
        `}return B`
      <div class="live-stage">
        ${this._renderLivePicker()}
      </div>
    `}_renderDatePicker(){if(!this._showDatePicker)return B``;const e=this._datePickerDays||[],t=new Map;for(const i of e){const[e,n]=i.split("-"),s=`${e}-${n}`;t.has(s)||t.set(s,[]),t.get(s).push(i)}const i=this._selectedDay;return B`
      <div class="live-picker-backdrop" @click=${()=>this._closeDatePicker()}></div>
      <div class="live-picker date-picker" @click=${e=>e.stopPropagation()}>
        <div class="live-picker-head">
          <div class="live-picker-title">Select date</div>
          <button class="live-picker-close" @click=${()=>this._closeDatePicker()} title="Close" aria-label="Close">
            <ha-icon icon="mdi:close"></ha-icon>
          </button>
        </div>
        <div class="live-picker-list">
          ${[...t.entries()].map(([e,t])=>B`
            <div class="dp-month-header">
              ${new Intl.DateTimeFormat(this._locale(),{month:"long",year:"numeric"}).format(new Date(`${e}-01T00:00:00`))}
            </div>
            ${t.map(e=>{const t=e===i;return B`
                <button
                  class="live-picker-item ${t?"on":""}"
                  @click=${()=>{this._selectedDay=e,this._selectedIndex=0,this._pendingScrollToI=null,this._forceThumbReset=!0,this._exitSelectMode(),this.config?.clean_mode&&(this._previewOpen=!1),this._closeDatePicker()}}
                >
                  <span class="dp-day-label">${this._formatDay(e)}</span>
                  ${t?B`<ha-icon class="live-picker-check" icon="mdi:check"></ha-icon>`:B``}
                </button>
              `})}
          `)}
        </div>
      </div>
    `}_renderLivePicker(){const e=this._liveCameraListCache||this._getLiveCameraOptions();if(!e.length||!this._showLivePicker)return B``;const t=this._getEffectiveLiveCamera();return B`
      <div
        class="live-picker-backdrop"
        @click=${()=>this._closeLivePicker()}
      ></div>

      <div class="live-picker" @click=${e=>e.stopPropagation()}>
        <div class="live-picker-head">
          <div class="live-picker-title">Select camera</div>
          <button
            class="live-picker-close"
            @click=${()=>this._closeLivePicker()}
            title="Close"
            aria-label="Close"
          >
            <ha-icon icon="mdi:close"></ha-icon>
          </button>
        </div>

        <div class="live-picker-list">
          ${e.map(e=>{const i=e===t;return B`
              <button
                class="live-picker-item ${i?"on":""}"
                @click=${()=>this._selectLiveCamera(e)}
                title="${this._friendlyCameraName(e)}"
              >
                <div class="live-picker-item-left">
                  <ha-icon icon="mdi:video"></ha-icon>
                  <div class="live-picker-item-name">
                    <span>${this._friendlyCameraName(e)}</span>
                    <span class="live-picker-item-entity">${e}</span>
                  </div>
                </div>

                ${i?B`<ha-icon
                      class="live-picker-check"
                      icon="mdi:check"
                    ></ha-icon>`:B``}
              </button>
            `})}
        </div>
      </div>
    `}async _selectLiveCamera(e){const t=String(e||"").trim();t&&(this._hideLiveQuickSwitchButton(),this._liveCard=null,this._liveCardConfigKey="",this._liveWarmedUp=!1,this._signedWsPath=null,this._liveSelectedCamera=t,this._aspectRatio=this._parseAspectRatio(this.config?.aspect_ratio),this._showLivePicker=!1,this.requestUpdate(),await this.updateComplete,this._mountLiveCard())}_navLiveCamera(e){const t=this._getLiveCameraOptions();if(t.length<=1)return;const i=this._getEffectiveLiveCamera(),n=t.indexOf(i),s=t[(n+e+t.length)%t.length];this._selectLiveCamera(s),this._showPills()}_setViewMode(e){const t="live"===e?"live":"media";("live"!==t||this._hasLiveConfig())&&(this._viewMode=t,this._showNav=!1,"live"===t&&navigator.maxTouchPoints>0&&this._showPills(5e3),"live"!==t&&(this._hideLiveQuickSwitchButton(),this._showLivePicker=!1,this._resetZoom(),this._aspectRatio=this._parseAspectRatio(this.config?.aspect_ratio)),this.requestUpdate())}_showLiveQuickSwitchButton(){this._isLiveActive()&&(this._getLiveCameraOptions().length<=1||(this._showLiveQuickSwitch=!0,this.requestUpdate(),this._liveQuickSwitchTimer&&clearTimeout(this._liveQuickSwitchTimer),this._liveQuickSwitchTimer=setTimeout(()=>{this._showLiveQuickSwitch=!1,this.requestUpdate()},2500)))}_onPreviewClick(e){if(!this._isLiveActive())return;const t=e.composedPath?.()||[];return this._pathHasClass(t,"live-picker")||this._pathHasClass(t,"live-picker-backdrop")||this._pathHasClass(t,"live-quick-switch")?void 0:this._hamburgerOpen&&!this._pathHasClass(t,"live-hamburger-wrap")?(this._hamburgerOpen=!1,void this._showPills(2500)):void this._showLiveQuickSwitchButton()}_toggleLiveMode(){if(this._hasLiveConfig()){if(this._isLiveActive())return this._hideLiveQuickSwitchButton(),this._setViewMode("media"),void(this._showLivePicker=!1);this._hideLiveQuickSwitchButton(),this._setViewMode("live"),this._showLivePicker=!1,this.requestUpdate()}}_clearThumbLongPress(){this._thumbLongPressTimer&&(clearTimeout(this._thumbLongPressTimer),this._thumbLongPressTimer=null)}_closeThumbMenu(){this._thumbMenuItem=null,this._thumbMenuOpen=!1,this._thumbMenuOpenedAt=0,this.requestUpdate()}_getThumbActions(e){const t=[];return this._thumbCanDelete(e)&&t.push({danger:!0,icon:"mdi:trash-can-outline",id:"delete",label:"Delete"}),this._thumbCanMultipleDelete()&&t.push({icon:"mdi:select-multiple",id:"multiple_delete",label:"Multiple delete"}),this._thumbCanDownload(e)&&t.push({icon:"mdi:download",id:"download",label:"Download"}),t.sort((e,t)=>e.label.localeCompare(t.label,this._locale())),t}async _handleThumbAction(e,t){if(!t?.src)return;const i=("media"===this.config?.source_mode||"combined"===this.config?.source_mode)&&this._isMediaSourceId(t.src);let n=t.src;if(i&&(n=this._ms?.urlCache?.get(t.src)||"",!n))try{n=await this._msResolve(t.src)}catch(e){}return"delete"===e?(this._closeThumbMenu(),void await this._deleteSingle(t.src)):"multiple_delete"===e?(this._closeThumbMenu(),this._selectMode=!0,this._selectedSet?.clear?.(),this._selectedSet?.add?.(t.src),this._showBulkDeleteHint(),void this.requestUpdate()):void("download"===e&&(this._closeThumbMenu(),await this._downloadSrc(n||t.src)))}_isFrigateMediaItem(e){return this._isMediaSourceId(e)&&String(e||"").startsWith("media-source://frigate/")}_onThumbContextMenu(e,t){this._selectMode||this._isFrigateMediaItem(t?.src)||(e.preventDefault(),e.stopPropagation(),this._clearThumbLongPress(),this._openThumbMenu(t),this._suppressNextThumbClick=!0)}_onThumbPointerCancel(){this._clearThumbLongPress()}_onThumbPointerDown(e,t){this._selectMode||t?.src&&(null!=e?.button&&0!==e.button||this._isFrigateMediaItem(t.src)||(this._thumbLongPressStartX=e.clientX??0,this._thumbLongPressStartY=e.clientY??0,this._clearThumbLongPress(),this._thumbLongPressTimer=setTimeout(()=>{this._thumbLongPressTimer=null,this._suppressNextThumbClick=!0,this._openThumbMenu(t)},520)))}_onThumbPointerMove(e){if(!this._thumbLongPressTimer)return;const t=Math.abs((e.clientX??0)-this._thumbLongPressStartX),i=Math.abs((e.clientY??0)-this._thumbLongPressStartY);(t>12||i>12)&&this._clearThumbLongPress()}_onThumbPointerUp(){this._clearThumbLongPress()}_openThumbMenu(e){if(e?.src){this._thumbMenuItem=e,this._thumbMenuOpen=!0,this._thumbMenuOpenedAt=Date.now(),this.requestUpdate();try{navigator.vibrate?.(12)}catch(e){}}}_renderThumbActionSheet(){if(!this._thumbMenuOpen||!this._thumbMenuItem)return B``;const e=this._thumbMenuItem,t=this._getThumbActions(e),i=this._tsLabelFromFilename(e.src);return B`
      <div
        class="thumb-menu-backdrop"
        @click=${e=>{e.preventDefault(),e.stopPropagation(),this._thumbMenuCanAcceptTap()&&this._closeThumbMenu()}}
      ></div>

      <div
        class="thumb-menu-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Thumbnail actions"
        @click=${e=>e.stopPropagation()}
      >
        <div class="thumb-menu-handle"></div>

        <div class="thumb-menu-head">
          <div class="thumb-menu-subtitle">${i||"Media item"}</div>
        </div>

        <div class="thumb-menu-list">
          ${t.map(t=>B`
              <button
                class="thumb-menu-item ${t.danger?"danger":""}"
                @click=${i=>{i.preventDefault(),i.stopPropagation(),this._thumbMenuCanAcceptTap()&&this._handleThumbAction(t.id,e)}}
              >
                <div class="thumb-menu-item-left">
                  <ha-icon icon="${t.icon}"></ha-icon>
                  <span>${t.label}</span>
                </div>
                <ha-icon
                  class="thumb-menu-item-arrow"
                  icon="mdi:chevron-right"
                ></ha-icon>
              </button>
            `)}
        </div>

        <div class="thumb-menu-footer">
          <button
            class="thumb-menu-cancel"
            @click=${e=>{e.preventDefault(),e.stopPropagation(),this._thumbMenuCanAcceptTap()&&this._closeThumbMenu()}}
          >
            Cancel
          </button>
        </div>
      </div>
    `}_thumbCanDelete(e){if(!e?.src)return!1;const t=this.config?.source_mode;return("sensor"===t||"combined"===t)&&(!("combined"===t&&!this._srcEntityMap?.has(e.src))&&(!!this.config?.allow_delete&&!!this._serviceParts()))}_thumbCanDownload(e){return!!e?.src}_thumbMenuCanAcceptTap(){return Date.now()-(this._thumbMenuOpenedAt||0)>700}async _deleteSingle(e){const t=this.config?.source_mode;if("sensor"!==t&&"combined"!==t)return;if("combined"===t&&!this._srcEntityMap?.has(e))return;if(!this.config?.allow_delete)return;const i=this._serviceParts();if(!i)return;const n=this._toFsPath(e),s=this._normPrefixHardcoded();if(n&&n.startsWith(s)){if(this.config?.delete_confirm){if(!window.confirm("Are you sure you want to delete this file?"))return}try{await this._hass.callService(i.domain,i.service,{path:n}),this._deleted.add(e),this._selectedSet?.delete?.(e);this._items().length||(this._selectedIndex=0),this.requestUpdate()}catch(e){}}}async _downloadSrc(e){if(!e)return;const t=String(e),i=t.split("?")[0].split("#")[0],n=(()=>{try{return decodeURIComponent(i.split("/").pop()||"download")}catch(e){return i.split("/").pop()||"download"}})();try{const e=await fetch(t);if(!e.ok)throw new Error(`HTTP ${e.status}`);const i=await e.blob(),s=URL.createObjectURL(i),r=document.createElement("a");r.href=s,r.download=n,document.body.appendChild(r),r.click(),r.remove(),setTimeout(()=>URL.revokeObjectURL(s),5e3)}catch(e){window.open(t,"_blank","noopener,noreferrer")}}_isMediaSourceId(e){return String(e||"").startsWith("media-source://")}_isFrigateRoot(e){const t=String(e||"");return t.includes("media-source://frigate/")||"media-source://frigate"===t}_hasFrigateSource(){return(Array.isArray(this.config?.media_sources)&&this.config.media_sources.length?this.config.media_sources:this.config?.media_source?[this.config.media_source]:[]).some(e=>this._isFrigateRoot(e))}_getFrigateSnapshotsRoot(){return"media-source://frigate/frigate/event-search/snapshots"}_isVideo(e){const t=String(e||"").split("?")[0].split("#")[0];return/\.(mp4|webm|mov|m4v)$/i.test(t)}_toFsPath(e){if(!e)return"";let t=String(e).trim();t=t.split("?")[0].split("#")[0];try{(t.startsWith("http://")||t.startsWith("https://"))&&(t=new URL(t).pathname)}catch(e){}try{t=decodeURIComponent(t)}catch(e){}return t.startsWith("/local/")?"/config/www/"+t.slice(7):t.startsWith("/config/www/")?t:""}_getFilterAliases(e){const t=String(e||"").toLowerCase().trim();if(!t)return[];return{person:["person","persoon","personen"],visitor:["visitor","visitors","bezoeker","bezoekers","bezoek"],dog:["dog","hond","honden"],cat:["cat","kat","katten"],car:["car","auto","autos","voertuig","vehicle"],truck:["truck","vrachtwagen"],bicycle:["bicycle","fiets","fietser","bike"],motorcycle:["motorcycle","motor","motorbike"],bird:["bird","vogel","vogels"],bus:["bus"]}[t]||[t]}_itemFilenameForFilter(e){return e?"string"==typeof e?String(e).toLowerCase():String(e.filename||e.name||e.basename||e.path||e.file||e.fullpath||e.src||"").toLowerCase():""}_sensorTextForFilter(e,t=null){return`${String(e||"").toLowerCase()} ${String(t?.attributes?.friendly_name||t?.attributes?.name||"").toLowerCase()}`.trim()}_matchesObjectFilterForFileSensor(e,t,i,n=null){const s=this._getFilterAliases(t);if(!s.length)return!0;const r=this._sensorTextForFilter(i,n),o=this._itemFilenameForFilter(e);return s.some(e=>{const t=String(e||"").toLowerCase().trim();return!!t&&(r.includes(t)||o.includes(t))})}_findMatchingSnapshotMediaId(e){const t=String(e||"").trim();if(!t)return"";if(this._snapshotCache.has(t))return this._snapshotCache.get(t);const i=(t.split("/").pop()||"").toLowerCase().replace(/\.(mp4|webm|mov|m4v)$/i,"");if(!i)return this._snapshotCache.set(t,""),"";const n=Array.isArray(this._frigateSnapshots)?this._frigateSnapshots:[];if(!n.length)return this._snapshotCache.set(t,""),"";let s=n.find(e=>(String(e?.id||"").split("/").pop()?.toLowerCase()||"").replace(/\.(jpg|jpeg|png|webp)$/i,"")===i);if(s||(s=n.find(e=>String(e?.id||"").toLowerCase().includes(i))),!s){const e=this._dtMsFromSrc(t);if(Number.isFinite(e)){let t=null,i=1/0;for(const s of n){const n=Number(s?.dtMs);if(!Number.isFinite(n))continue;const r=Math.abs(n-e);r<i&&(t=s,i=r)}t&&i<=15e3&&(s=t)}}const r=s?.id||"";return this._snapshotCache.set(t,r),r}_queueSnapshotResolveForVisibleThumbs(e){if(!Array.isArray(e)||!e.length)return;if(!this._hasFrigateSource())return;const t=[];for(const i of e){const e=String(i?.src||"");if(!e||!this._isMediaSourceId(e))continue;const n=this._findMatchingSnapshotMediaId(e);n&&t.push(n)}t.length&&this._msQueueResolve(t)}_toWebPath(e){if(!e)return"";const t=String(e).trim();return t.startsWith("/config/www/")?"/local/"+t.slice(12):"/config/www"===t?"/local":t}_resolveVideoPoster(e,t,i,n,s){if(!t)return this._posterCache.get(e.src)||"";if(this._hasFrigateSource()){const t=this._findMatchingSnapshotMediaId(e.src);if(t){const e=this._ms?.urlCache?.get(t)||"";if(e)return e;this._msQueueResolve([t])}}for(const e of[n,i]){if(!e)continue;const t=this._posterCache.get(e);return t||(e!==s&&this._enqueuePoster(e),"")}return""}_captureFrame(e,t=0){return new Promise((i,n)=>{const s=document.createElement("video");let r;s.muted=!0,s.setAttribute("muted",""),s.playsInline=!0,s.preload="metadata";const o=()=>{clearTimeout(r);try{s.pause(),s.removeAttribute("src"),s.load()}catch(e){}},a=e=>{o(),n(e??new Error("poster fail"))},l=()=>{try{const e=s.videoWidth,t=s.videoHeight;if(!e||!t)return a(new Error("no video dimensions"));const n=Math.min(1,320/e),r=document.createElement("canvas");r.width=Math.max(1,Math.round(e*n)),r.height=Math.max(1,Math.round(t*n)),r.getContext("2d").drawImage(s,0,0,r.width,r.height),o(),i(r.toDataURL("image/jpeg",.6))}catch(e){a(e)}};r=setTimeout(()=>a(new Error("poster timeout")),3e3),s.addEventListener("error",()=>{const e=new Error("video load error");e.mediaErrorCode=s.error?.code,a(e)},{once:!0}),s.addEventListener("loadedmetadata",()=>{const e=Number.isFinite(s.duration)&&s.duration>0?s.duration:0,i=Math.max(0,Math.min(100,Number(t)||0));let n=.01;e&&i>0&&(n=100===i?Math.max(.01,e-.05):e*(i/100));try{s.currentTime=n}catch(e){l()}},{once:!0}),s.addEventListener("seeked",()=>l(),{once:!0}),s.src=e;try{s.load()}catch(e){}})}_thumbHash(e){let t=2166136261;for(let i=0;i<e.length;i++)t^=e.charCodeAt(i),t=Math.imul(t,16777619)>>>0;return"cgc_p_"+t.toString(36)}_lsKey(e){const t=this.config?.thumbnail_frame_pct??0;return this._thumbHash(e+"|"+t)}_lsThumbGet(e){try{return localStorage.getItem(this._lsKey(e))||null}catch(e){return null}}_lsThumbSet(e,t){try{const i=this._lsKey(e),n="cgc_poster_index",s=JSON.parse(localStorage.getItem(n)||"[]");if(s.length>=150){s.splice(0,s.length-149).forEach(e=>{try{localStorage.removeItem(e)}catch(e){}})}s.includes(i)||s.push(i),localStorage.setItem(n,JSON.stringify(s)),localStorage.setItem(i,t)}catch(e){}}_lsThumbDelete(e){try{const t=this._lsKey(e),i="cgc_poster_index",n=JSON.parse(localStorage.getItem(i)||"[]"),s=n.indexOf(t);s>=0&&(n.splice(s,1),localStorage.setItem(i,JSON.stringify(n))),localStorage.removeItem(t)}catch(e){}}async _fetchProtectedAsDataUrl(e){const t=this._hass?.auth?.data?.access_token;if(!t)return null;const i=await fetch(window.location.origin+e,{headers:{Authorization:`Bearer ${t}`}});if(404===i.status){const e=new Error("not found");throw e.status=404,e}if(!i.ok)return null;const n=await i.blob();return new Promise((e,t)=>{const i=new FileReader;i.onload=()=>e(i.result),i.onerror=t,i.readAsDataURL(n)})}async _ensurePoster(e){if(!e||this._posterCache.has(e)||this._posterPending.has(e))return;if(this._posterFailed.has(e))return;const t=this._lsThumbGet(e);if(t)return this._posterCache.set(e,t),void this.requestUpdate();this._posterPending.add(e);try{const t=e.startsWith("/")&&!this._isVideo(e)?await this._fetchProtectedAsDataUrl(e):await this._captureFrame(e,this.config?.thumbnail_frame_pct??0);t?(this._posterCache.set(e,t),this._lsThumbSet(e,t)):this._posterFailed.add(e)}catch(t){this._posterFailed.add(e);(404===t?.status||2===t?.mediaErrorCode||4===t?.mediaErrorCode)&&this._lsThumbDelete(e)}finally{this._posterPending.delete(e),this.requestUpdate()}}async _msBrowse(e){const t=this._msBrowseTtlCache.get(e);if(t&&Date.now()-t.ts<36e5)return t.data;const i=await this._wsWithTimeout({type:"media_source/browse_media",media_content_id:e},1e4);return this._msBrowseTtlCache.set(e,{ts:Date.now(),data:i}),i}async _msEnsureLoaded(){const e=Array.isArray(this.config?.media_sources)&&this.config.media_sources.length?this._msNormalizeRoots(this.config.media_sources):this._msNormalizeRoots(this.config?.media_source);if(!e.length)return;if(this.config?.frigate_url&&e.some(e=>this._isFrigateRoot(e))&&!this._ms.frigateApiFailed){const e=this._normMaxMedia(this.config?.max_media),t=`frigate_api:${this.config.frigate_url}:${e}`,i=this._ms.key===t,n=i&&Date.now()-(this._ms.loadedAt||0)<3e4;if(this._ms.loading||n)return;i||(this._ms.key=t,this._msSetList([]),this._ms.urlCache=new Map,this._msResolveFailed=new Set,this._ms.frigateApiFailed=!1),this._ms.loading=!0;try{const t=await this._msLoadFrigateApi();if(null===t)return this._ms.frigateApiFailed=!0,this._ms.loading=!1,void setTimeout(()=>this._msEnsureLoaded(),0);this._msSetList(t.slice(0,e)),this._ms.loadedAt=Date.now()}catch(e){console.warn("CGC Frigate API load failed:",e),this._ms.frigateApiFailed=!0,this._msSetList([])}finally{this._ms.loading=!1,this.requestUpdate()}return}const t=Date.now(),i=this._msKeyFromRoots(e),n=this._ms.key===i,s=n&&t-(this._ms.loadedAt||0)<3e4;if(this._ms.loading||s)return;n||(this._ms.key=i,this._msSetList([]),this._ms.roots=e.slice(),this._ms.urlCache=new Map,this._msResolveFailed=new Set);const r=this._msWalkCacheLoad(i);if(r&&r.length>0){this._msSetList(r),this.requestUpdate();try{const e=localStorage.getItem(this._msWalkCacheKey(i)),t=e?JSON.parse(e):null,n=t?.ts||0;this._ms.loadedAt=n,Date.now()-n>3e5&&setTimeout(()=>this._msEnsureLoaded(),0)}catch(e){this._ms.loadedAt=0,setTimeout(()=>this._msEnsureLoaded(),0)}}else{this._ms.loading=!0;try{const t=this._normMaxMedia(this.config?.max_media),n=(e.some(e=>String(e).includes("media-source://frigate/")),Math.min(2e3,Math.max(4*t,400))),s=Math.min(4e3,Math.max(2*n,800)),r=Math.max(40,Math.ceil(s/e.length)),o=[],a=await Promise.all(e.map(async t=>{try{const i=String(t),s=i.includes("media_source/local/"),o=i.includes("media-source://frigate/")?3:s?Math.min(6,6):6,a=1===e.length?e=>{e.length>=1&&(this._msSetList(e.filter(e=>!!e?.media_content_id).map(e=>({cls:String(e.media_class||""),id:String(e.media_content_id||""),mime:String(e.mime_type||""),title:String(e.title||""),thumb:String(e.thumbnail||"")})).filter(e=>!!e.id).slice(0,n)),this.requestUpdate())}:null;return await this._msWalkIter(t,r,o,a)}catch(e){return console.warn("MS root failed:",t,e),[]}}));if(o.push(...a.flat()),e.some(e=>this._isFrigateRoot(e)))try{const e=this._getFrigateSnapshotsRoot(),i=await this._msWalkIter(e,Math.min(400,Math.max(6*t,120)),3);this._frigateSnapshots=i.filter(e=>!!e?.media_content_id).map(e=>({id:String(e.media_content_id||""),title:String(e.title||""),mime:String(e.mime_type||""),cls:String(e.media_class||""),thumb:String(e.thumbnail||""),dtMs:this._dtMsFromSrc(String(e.title||e.media_content_id||"")),dayKey:this._extractDayKey(String(e.title||e.media_content_id||""))})).filter(e=>!!e.id)}catch(e){console.warn("Frigate snapshots load failed:",e),this._frigateSnapshots=[]}else this._frigateSnapshots=[];let l=o.filter(e=>!!e?.media_content_id).map(e=>({cls:String(e.media_class||""),id:String(e.media_content_id||""),mime:String(e.mime_type||""),title:String(e.title||""),thumb:String(e.thumbnail||"")})).filter(e=>!!e.id);l=this._dedupeByRelPath(l),l.sort((e,t)=>{const i=this._dtMsFromSrc(e.id),n=this._dtMsFromSrc(t.id),s=Number.isFinite(i),r=Number.isFinite(n);return s&&r&&n!==i?n-i:s&&!r?-1:!s&&r||e.title<t.title?1:e.title>t.title?-1:0}),this._msSetList(l.slice(0,n)),this._ms.loadedAt=Date.now(),this._msWalkCacheSave(i,this._ms.list)}catch(t){console.warn("MS ensure load failed:",t),console.warn("MS roots used:",e),this._msSetList([])}finally{this._ms.loading=!1,this.requestUpdate()}}}async _msLoadFrigateApi(){let e=String(this.config?.frigate_url||"").trim().replace(/\/+$/,"");if(!e)return null;/^https?:\/\//i.test(e)||(e="http://"+e);const t=Math.min(500,Math.max(2*this._normMaxMedia(this.config?.max_media),100));let i=null;try{const n=new AbortController;setTimeout(()=>n.abort(),15e3);const s=await fetch(`${e}/api/events?limit=${t}`,{signal:n.signal});if(!s.ok)return null;i=await s.json()}catch(e){return null}if(!Array.isArray(i))return null;const n=[];for(const t of i){const i=String(t.id||"");if(!i)continue;const s=`${e}/api/events/${i}/clip.mp4`,r=`${e}/api/events/${i}/thumbnail.jpg`,o=t.start_time?Math.round(1e3*t.start_time):0,a=String(t.label||""),l=String(t.camera||""),c=[o?new Date(o).toLocaleString():"",l,a].filter(Boolean).join(" — ");this._ms.urlCache.set(i,s),n.push({cls:"video",id:i,mime:"video/mp4",title:c,thumb:r})}return n}_msWalkCacheKey(e){let t=2166136261;for(let i=0;i<e.length;i++)t^=e.charCodeAt(i),t=Math.imul(t,16777619)>>>0;return"cgc_mswalk2_"+t.toString(36)}_msWalkCacheSave(e,t){try{localStorage.setItem(this._msWalkCacheKey(e),JSON.stringify({ts:Date.now(),list:t}))}catch(e){}}_msWalkCacheLoad(e,t=18e5){try{const i=localStorage.getItem(this._msWalkCacheKey(e));if(!i)return null;const n=JSON.parse(i);return!Array.isArray(n?.list)||Date.now()-n.ts>t?null:n.list}catch(e){return null}}_msIds(){return Array.isArray(this._ms?.list)?this._ms.list.map(e=>e.id):[]}_msIsRenderable(e,t,i){const n=String(i||"").toLowerCase(),s=String(e||"").toLowerCase(),r=String(t||"").toLowerCase();return!!s.startsWith("image/")||(!!s.startsWith("video/")||(!!/\.(jpg|jpeg|png|webp|gif)$/i.test(n)||(!!/\.(mp4|webm|mov|m4v)$/i.test(n)||("image"===r||"video"===r))))}_msKeyFromRoots(e,t){const i=Array.isArray(e)&&e.length?this._msNormalizeRoots(e):this._msNormalizeRoots(t);return i.length?i.slice().sort((e,t)=>e<t?-1:e>t?1:0).join(" | "):""}_msSetList(e){this._ms.list=e,this._ms.listIndex=new Map(e.map(e=>[e.id,e]))}_msMetaById(e){const t=this._ms?.listIndex?.get(e);return t?{cls:t.cls||"",mime:t.mime||"",title:t.title||"",thumb:t.thumb||""}:{cls:"",mime:"",title:"",thumb:""}}_msNormalizeRoot(e){let t=String(e||"").trim();if(!t)return"";const i=e=>String(e||"").replace(/^\/+/,"").replace(/\/+$/,"");if(t.startsWith("media-source://")){let e=t.slice(15).replace(/\/{2,}/g,"/").replace(/\/+$/g,"");return e.startsWith("local/")&&(e=`media_source/${e}`),`media-source://${e}`}if(t=i(t),/^frigate(\/|$)/i.test(t)){const e=i(t.replace(/^frigate/i,""));return e?`media-source://frigate/${e}`:"media-source://frigate"}return t=t.replace(/^media\//,""),`media-source://media_source/${t}`}_msNormalizeRoots(e){const t=Array.isArray(e)?e:e?[e]:[],i=[],n=new Set;for(const e of t){const t=this._msNormalizeRoot(e);if(!t)continue;const s=String(t).toLowerCase();n.has(s)||(n.add(s),i.push(t))}return i}_msQueueResolve(e){for(const t of e||[])!t||this._ms.urlCache.has(t)||this._msResolveFailed.has(t)||this._msResolveQueued.add(t);this._msResolveInFlight||(this._msResolveInFlight=!0,(async()=>{try{for(;this._msResolveQueued.size;){const e=Array.from(this._msResolveQueued).slice(0,32);e.forEach(e=>this._msResolveQueued.delete(e)),await Promise.allSettled(e.map(e=>this._msResolve(e))),this.requestUpdate()}}finally{this._msResolveInFlight=!1}})().catch(()=>{this._msResolveInFlight=!1}))}async _msResolve(e){const t=this._ms?.urlCache?.get(e);if(t)return t;let i;try{i=await this._wsWithTimeout({type:"media_source/resolve_media",media_content_id:e,expires:3600},12e3)}catch(t){return this._msResolveFailed.add(e),""}const n=i?.url?String(i.url):"";return n?(this._ms.urlCache.set(e,n),this.requestUpdate()):this._msResolveFailed.add(e),n}_msTitleById(e){return this._ms?.listIndex?.get(e)?.title||""}async _msWalkIter(e,t,i,n=null){const s=[],r=[{depth:0,id:e}];for(;r.length&&s.length<t;){const e=s.length,o=[];for(;r.length&&o.length<20;){const e=r.pop();e&&e.depth<=i&&o.push(e)}if(!o.length)break;const a=await Promise.all(o.map(async({depth:e,id:t})=>{try{return{depth:e,node:await this._msBrowse(t)}}catch(t){return{depth:e,node:null}}}));for(const{depth:e,node:i}of a){if(!i)continue;const n=Array.isArray(i?.children)?i.children:[];if(n.length)for(let i=n.length-1;i>=0&&!(s.length>=t);i--){const t=n[i],o=String(t?.media_content_id||"");if(!o)continue;const a=!!t?.can_expand,l=!!t?.can_play,c=String(t?.media_class||"").toLowerCase();a||!l&&"directory"===c?r.push({depth:e+1,id:o}):(l||this._msIsRenderable(t?.mime_type,t?.media_class,t?.title))&&s.push(t)}else if(i?.media_content_id){(!!i?.can_play||this._msIsRenderable(i?.mime_type,i?.media_class,i?.title))&&s.length<t&&s.push(i)}}n&&s.length>e&&n([...s])}return s}_wsWithTimeout(e,t=1e4){const i=this._hass.callWS(e),n=new Promise((i,n)=>setTimeout(()=>n(new Error(`WS timeout: ${e?.type}`)),t));return Promise.race([i,n])}_dayKeyFromMs(e){if(!Number.isFinite(e))return null;try{const t=new Date(e),i=String(t.getFullYear()).padStart(4,"0"),n=String(t.getMonth()+1).padStart(2,"0");return`${i}-${n}-${String(t.getDate()).padStart(2,"0")}`}catch(e){return null}}_dedupeByRelPath(e){const t=new Map,i=e=>String(e||"").replace(/^media-source:\/\/media_source\//,"").replace(/^media-source:\/\/media_source/,"").replace(/^media-source:\/\//,"").replace(/\/{2,}/g,"/").replace(/^\/+/,"").replace(/\/+$/g,"").trim().toLowerCase();for(const n of e||[]){const e=i(n?.media_content_id||n?.path||n?.id||n);e&&(t.has(e)||t.set(e,n))}return Array.from(t.values())}_dtKeyFromMs(e){if(!Number.isFinite(e))return null;try{const t=new Date(e),i=String(t.getFullYear()).padStart(4,"0"),n=String(t.getMonth()+1).padStart(2,"0"),s=String(t.getDate()).padStart(2,"0"),r=String(t.getHours()).padStart(2,"0"),o=String(t.getMinutes()).padStart(2,"0");return`${i}-${n}-${s}T${r}:${o}:${String(t.getSeconds()).padStart(2,"0")}`}catch(e){return null}}_dtMsFromSrc(e){const t=this._parseFolderFileDatetime(e);if(null!=t?.ms)return t.ms;const i=this._parseDateFromFilename(e,this.config?.filename_datetime_format);if(null!=i?.ms)return i.ms;const n=this._extractEpochMs(e);if(Number.isFinite(n))return n;const s=this._extractYmdHms(e);if(s?.dtKey){const e=new Date(s.dtKey).getTime();if(Number.isFinite(e))return e}const r=(()=>{const t=this._sourceNameForParsing(e),i=String(t||"").match(/(\d{8})[_-](\d{6})/);return i?`${i[1].slice(0,4)}-${i[1].slice(4,6)}-${i[1].slice(6,8)}T${i[2].slice(0,2)}:${i[2].slice(2,4)}:${i[2].slice(4,6)}`:null})();if(r){const e=new Date(r).getTime();if(Number.isFinite(e))return e}const o=(()=>{const t=this._sourceNameForParsing(e),i=String(t||"").match(/(\d{8})/);return i?`${i[1].slice(0,4)}-${i[1].slice(4,6)}-${i[1].slice(6,8)}`:null})();if(o){const e=new Date(`${o}T00:00:00`).getTime();if(Number.isFinite(e))return e}const a=(()=>{const t=String(e||"").match(/\/(\d{8})\/(\d{6})\./);return t?`${t[1].slice(0,4)}-${t[1].slice(4,6)}-${t[1].slice(6,8)}T${t[2].slice(0,2)}:${t[2].slice(2,4)}:${t[2].slice(4,6)}`:null})();if(a){const e=new Date(a).getTime();if(Number.isFinite(e))return e}const l=this._autoDetectFolderFileDate(e);return null!=l?.ms?l.ms:NaN}_extractDateTimeKey(e){const t=this._parseFolderFileDatetime(e);if(t?.dtKey)return t.dtKey;const i=this._parseDateFromFilename(e,this.config?.filename_datetime_format);if(i?.dtKey)return i.dtKey;const n=this._extractYmdHms(e);if(n?.dtKey)return n.dtKey;const s=this._autoDetectFolderFileDate(e);if(s?.dtKey)return s.dtKey;const r=this._dtMsFromSrc(e),o=this._dtKeyFromMs(r);if(o)return o;const a=this._sourceNameForParsing(e),l=String(a||"").match(/(\d{8})[_-](\d{6})/);return l?`${l[1].slice(0,4)}-${l[1].slice(4,6)}-${l[1].slice(6,8)}T${l[2].slice(0,2)}:${l[2].slice(2,4)}:${l[2].slice(4,6)}`:null}_extractDayKey(e){const t=this._parseFolderFileDatetime(e);if(t?.dayKey)return t.dayKey;const i=this._parseDateFromFilename(e,this.config?.filename_datetime_format);if(i?.dayKey)return i.dayKey;const n=this._extractYmdHms(e);if(n?.dayKey)return n.dayKey;const s=this._autoDetectFolderFileDate(e);if(s?.dayKey)return s.dayKey;const r=this._dtMsFromSrc(e),o=this._dayKeyFromMs(r);if(o)return o;const a=this._sourceNameForParsing(e),l=String(a).match(/(\d{8})/);return l?`${l[1].slice(0,4)}-${l[1].slice(4,6)}-${l[1].slice(6,8)}`:null}_extractEpochMs(e){const t=this._sourceNameForParsing(e);if(!t)return NaN;let i=String(t).match(/-(\d{9,11}(?:\.\d+)?)-/);if(i||(i=String(t).match(/(\d{9,11}(?:\.\d+)?)/)),!i)return NaN;const n=Number.parseFloat(i[1]);return Number.isFinite(n)?n<946684800||n>4102444800?NaN:1e3*n:NaN}_extractYmdHms(e){const t=this._sourceNameForParsing(e);if(!t)return null;const i=String(t).match(/(\d{4})-(\d{2})-(\d{2})[T _-]?(\d{2})[:\-\.](\d{2})[:\-\.](\d{2})/);if(!i)return null;const n=i[1],s=i[2],r=i[3];return{dayKey:`${n}-${s}-${r}`,dtKey:`${n}-${s}-${r}T${i[4]}:${i[5]}:${i[6]}`}}_formatDateTime(e){if(!e)return"";try{const t=new Date(e),i=this._locale(),n=new Intl.DateTimeFormat(i,{day:"numeric",month:"long",year:"numeric"}).format(t);return`${n} • ${new Intl.DateTimeFormat(i,{hour:"2-digit",minute:"2-digit",hour12:this._useAmPm()}).format(t)}`}catch(e){return""}}_formatDay(e){if(!e)return"";try{return new Intl.DateTimeFormat(this._locale(),{day:"numeric",month:"long"}).format(new Date(`${e}T00:00:00`))}catch(t){return e}}_formatTimeFromMs(e){if(!Number.isFinite(e))return"";try{return new Intl.DateTimeFormat(this._locale(),{hour:"2-digit",minute:"2-digit",hour12:this._useAmPm()}).format(new Date(e))}catch(e){return""}}_items(){const e=this.config?.source_mode,t="media"===e;if("combined"===e){const e=this._sensorEntityList();let t=[];this._srcEntityMap=this._srcEntityMap||new Map;for(const i of e){const e=this._hass?.states?.[i],n=e?.attributes?.[le];if(!n)continue;let s=[];if(Array.isArray(n))s=n.map(e=>this._toWebPath(e)).filter(Boolean);else if("string"==typeof n)try{const e=JSON.parse(n);s=Array.isArray(e)?e.map(e=>this._toWebPath(e)).filter(Boolean):[this._toWebPath(n)].filter(Boolean)}catch(e){s=[this._toWebPath(n)].filter(Boolean)}for(const e of s)this._srcEntityMap.has(e)||this._srcEntityMap.set(e,i);t.push(...s)}t=this._dedupeByRelPath(t);const i=this._dedupeByRelPath(this._msIds()),n=this._dedupeByRelPath([...t,...i]);return this._deleted?.size?n.filter(e=>!this._deleted.has(e)):n}if(t){let e=this._msIds();return e=this._dedupeByRelPath(e),this._deleted?.size?e.filter(e=>!this._deleted.has(e)):e}const i=this._sensorEntityList();if(!i.length)return[];let n=[];this._srcEntityMap=new Map;for(const e of i){const t=this._hass?.states?.[e],i=t?.attributes?.[le];if(!i)continue;let s=[];if(Array.isArray(i))s=i.map(e=>this._toWebPath(e)).filter(Boolean);else if("string"==typeof i)try{const e=JSON.parse(i);s=Array.isArray(e)?e.map(e=>this._toWebPath(e)).filter(Boolean):[this._toWebPath(i)].filter(Boolean)}catch(e){s=[this._toWebPath(i)].filter(Boolean)}for(const t of s)this._srcEntityMap.has(t)||this._srcEntityMap.set(t,e);n.push(...s)}return n=this._dedupeByRelPath(n),this._deleted?.size&&(n=n.filter(e=>!this._deleted.has(e))),n}_isVideoSmart(e,t,i){const n=String(t||"").toLowerCase(),s=String(i||"").toLowerCase();return!!n.startsWith("video/")||("video"===s||this._isVideo(String(e||"")))}_resetThumbScrollToStart(){requestAnimationFrame(()=>{const e=this.renderRoot?.querySelector(".tthumbs");if(e){if(this._isThumbLayoutVertical()){e.scrollTop=0;try{e.scrollTo({behavior:"auto",top:0})}catch(e){}}else{e.scrollLeft=0;try{e.scrollTo({behavior:"auto",left:0})}catch(e){}}this._observedThumbs=new WeakSet,this._setupThumbObserver()}})}_scrollThumbIntoView(e){return(async()=>{try{await this.updateComplete}catch(e){}await new Promise(e=>requestAnimationFrame(()=>e()));const t=this.renderRoot?.querySelector(".tthumbs");if(!t)return;const i=t.querySelector(`button.tthumb[data-i="${e}"]`);if(!i)return;if(this._isThumbLayoutVertical()){const e=t.getBoundingClientRect(),n=i.getBoundingClientRect(),s=t.scrollTop+(n.top-e.top)+n.height/2-t.clientHeight/2,r=Math.max(0,t.scrollHeight-t.clientHeight),o=Math.max(0,Math.min(r,s));try{t.scrollTo({behavior:"smooth",top:o})}catch(e){t.scrollTop=o}return}const n=t.getBoundingClientRect(),s=i.getBoundingClientRect(),r=t.scrollLeft+(s.left-n.left)+s.width/2-t.clientWidth/2,o=Math.max(0,t.scrollWidth-t.clientWidth),a=Math.max(0,Math.min(o,r));try{t.scrollTo({behavior:"smooth",left:a})}catch(e){t.scrollLeft=a}})()}_sourceNameForParsing(e){if(!this._isMediaSourceId(e))return String(e||"");return this._msTitleById(e)||String(e||"")}_stepDay(e,t,i){if(!t?.length)return;const n=i&&t.includes(i)?i:t[0],s=t.indexOf(n),r=t[Math.min(Math.max(s+e,0),t.length-1)];this._selectedDay=r,this._selectedIndex=0,this._pendingScrollToI=null,this._forceThumbReset=!0,this._exitSelectMode(),this.config?.clean_mode&&(this._previewOpen=!1),this._isLiveActive()&&this._setViewMode("media"),this.requestUpdate()}_tsLabelFromFilename(e){const t=this._sourceNameForParsing(e);if(!t)return"";const i=this._dtMsFromSrc(e);if(Number.isFinite(i)){const e=this._dtKeyFromMs(i),t=this._formatDateTime(e);if(t)return t}const n=this._extractDayKey(e);if(n)try{return new Intl.DateTimeFormat(this._locale(),{day:"2-digit",month:"short",year:"numeric"}).format(new Date(`${n}T00:00:00`))}catch(e){return n}const s=(String(t).split("/").pop()||String(t)).replace(/\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif)$/i,"");return s.length>42?`${s.slice(0,39)}…`:s}_uniqueDays(e){const t=new Set;for(const i of e)i.dayKey&&t.add(i.dayKey);return Array.from(t).sort((e,t)=>e<t?1:-1)}_activeObjectFilters(){return Array.isArray(this._objectFilters)?this._objectFilters.map(e=>String(e||"").toLowerCase().trim()).filter(Boolean):[]}_filterLabel(e){const t=String(e||"").toLowerCase();return"bicycle"===t?"bicycle":"bird"===t?"bird":"bus"===t?"bus":"car"===t?"car":"cat"===t?"cat":"dog"===t?"dog":"motorcycle"===t?"motorcycle":"person"===t?"person":"truck"===t?"truck":"visitor"===t?"visitor":"selected"}_filterLabelList(e){const t=Array.isArray(e)?e.map(e=>String(e||"").toLowerCase().trim()).filter(Boolean):[];return t.length?t.map(e=>this._filterLabel(e)).join(", "):"selected"}_isObjectFilterActive(e){const t=String(e||"").toLowerCase().trim();return this._activeObjectFilters().includes(t)}_matchesObjectFilter(e){return this._matchesObjectFilterValue(e,this._objectFilters)}_isVideoForSrc(e){if(this._isMediaSourceId(e)){const t=this._msMetaById(e);return this._isVideoSmart(t.title||e,t.mime,t.cls)}return this._isVideo(e)}_matchesTypeFilter(e){if(this._filterVideo===this._filterImage)return!0;return this._isVideoForSrc(e)?this._filterVideo:this._filterImage}_matchesObjectFilterValue(e,t){const i=Array.isArray(t)?t.map(e=>String(e||"").toLowerCase().trim()).filter(Boolean):[];if(!i.length)return!0;if("sensor"===this.config?.source_mode){const t=this._srcEntityMap?.get(e)||"",n=t?this._hass?.states?.[t]:null;return i.some(i=>this._matchesObjectFilterForFileSensor(e,i,t,n))}const n=this._objectForSrc(e);return!!n&&i.includes(n)}_objectColor(e){const t=this.config?.object_colors;return e&&t&&"object"==typeof t&&t[e]?t[e]:"currentColor"}_objectForSrc(e){const t=String(e||"").trim();if(!t)return null;if(this._objectCache.has(t))return this._objectCache.get(t);let i=null;const n=this._getVisibleObjectFilters();let s="";if("sensor"===this.config?.source_mode){const t=this._srcEntityMap?.get(e)||"",i=t?this._hass?.states?.[t]:null;s=[this._itemFilenameForFilter(e),this._sensorTextForFilter(t,i)].join(" ")}else{const t=this._msMetaById(e);s=[t?.title,e].join(" ")}s=s.toLowerCase();for(const e of n){if(this._getFilterAliases(e).some(e=>s.includes(e))){i=e;break}}return this._objectCache.set(t,i),i}_objectIcon(e){if(!e)return"";if(this._customIcons&&this._customIcons[e])return this._customIcons[e];return{bicycle:"mdi:bicycle",bird:"mdi:bird",bus:"mdi:bus",car:"mdi:car",cat:"mdi:cat",dog:"mdi:dog",motorcycle:"mdi:motorbike",person:"mdi:account",truck:"mdi:truck",visitor:"mdi:doorbell-video"}[e]||"mdi:magnify"}_setObjectFilter(e){const t=String(e||"").toLowerCase().trim();if(!t)return;const i=new Set(this._getVisibleObjectFilters());if(!i.has(t))return;const n=this._activeObjectFilters().filter(e=>i.has(e)),s=new Set(n);s.has(t)?s.delete(t):s.add(t);const r=Array.from(s),o=this._items().map((e,t)=>{const i=this._dtMsFromSrc(e);return{dayKey:this._extractDayKey(e),dtMs:i,idx:t,src:e}});o.sort((e,t)=>{const i=Number.isFinite(e.dtMs),n=Number.isFinite(t.dtMs);return i&&n&&t.dtMs!==e.dtMs?t.dtMs-e.dtMs:i&&!n?-1:!i&&n?1:t.idx-e.idx});const a=o.map(e=>({dayKey:e.dayKey,src:e.src})),l=this._uniqueDays(a)[0]??null,c=this._selectedDay??l,d=c?a.filter(e=>e.dayKey===c):a,h=d.filter(e=>this._matchesObjectFilterValue(e.src,n)),p=Math.min(Math.max(this._selectedIndex??0,0),Math.max(0,h.length-1)),u=h.length>0?h[p]?.src:"",m=d.filter(e=>this._matchesObjectFilterValue(e.src,r));let g=0;if(u){const e=m.findIndex(e=>e.src===u);e>=0&&(g=e)}this._objectFilters=r,this._selectedIndex=g,this._pendingScrollToI=null,this._forceThumbReset=!0,this._isLiveActive()&&this._setViewMode("media"),this.requestUpdate()}_toggleFilterVideo(){this._filterVideo=!this._filterVideo,this._selectedIndex=0,this._pendingScrollToI=null,this._forceThumbReset=!0,this.requestUpdate()}_toggleFilterImage(){this._filterImage=!this._filterImage,this._selectedIndex=0,this._pendingScrollToI=null,this._forceThumbReset=!0,this.requestUpdate()}async _bulkDelete(e){const t=this.config?.source_mode;if("sensor"!==t&&"combined"!==t)return;if(!this.config?.allow_delete||!this.config?.allow_bulk_delete)return;const i=this._serviceParts();if(!i)return;const n=this._normPrefixHardcoded(),s=Array.from(e||[]);if(s.length){if(this.config?.delete_confirm){if(!window.confirm(`Are you sure you want to delete ${s.length} file(s)?`))return}for(const e of s){const t=this._toFsPath(e);if(t&&t.startsWith(n))try{await this._hass.callService(i.domain,i.service,{path:t}),this._deleted.add(e)}catch(e){}}this._selectedSet.clear(),this._selectMode=!1,this._hideBulkDeleteHint(),this.requestUpdate()}}_exitSelectMode(){this._selectMode=!1,this._selectedSet.clear(),this._hideBulkDeleteHint(),this.requestUpdate()}_toggleSelected(e){e&&(this._selectedSet.has(e)?this._selectedSet.delete(e):this._selectedSet.add(e),this.requestUpdate())}_isInsideTsbar(e){return(e.composedPath?.()||[]).some(e=>e?.classList?.contains("tsicon")||e?.classList?.contains("tsbar"))}_navNext(e){if(this._selectMode||this._isLiveActive())return;const t=this._selectedIndex??0;t>=e-1||(this._resetZoom(),this._selectedIndex=t+1,this._pendingScrollToI=this._selectedIndex,this.requestUpdate(),this._showNavChevrons(),this._showPills())}_navPrev(){if(this._selectMode||this._isLiveActive())return;const e=this._selectedIndex??0;e<=0||(this._resetZoom(),this._selectedIndex=e-1,this._pendingScrollToI=this._selectedIndex,this.requestUpdate(),this._showNavChevrons(),this._showPills())}_onPreviewPointerDown(e){if(!1===e?.isPrimary)return;const t=e.composedPath?.()||[];if(!(this._isInsideTsbar(e)||this._pathHasClass(t,"pnavbtn")||t.some(e=>"VIDEO"===e?.tagName)||this._pathHasClass(t,"viewtoggle")||this._pathHasClass(t,"live-picker")||this._pathHasClass(t,"live-picker-backdrop")||this._pathHasClass(t,"live-quick-switch")||this._isLiveActive()))if(this._zoomScale>1)this._swiping=!1;else{this._swiping=!0,this._swipeStartX=e.clientX,this._swipeStartY=e.clientY,this._swipeCurX=e.clientX,this._swipeCurY=e.clientY;try{e.currentTarget?.setPointerCapture?.(e.pointerId)}catch(e){}}}_getThumbRenderLimit(e,t){return e}_onPreviewPointerUp(e,t){if(this._isLiveActive())return this._swiping=!1,void this._showPills();if(this._zoomIsPinching)return this._swiping=!1,void(this._zoomIsPinching=!1);if(!this._swiping){if(this.config?.clean_mode&&!this._previewOpen)return;if(this._selectMode)return;return this._showNavChevrons(),void this._showPills()}if(this._swiping=!1,this.config?.clean_mode&&!this._previewOpen)return;const i=0!==e.clientX||0!==e.clientY?e.clientX:this._swipeCurX,n=0!==e.clientX||0!==e.clientY?e.clientY:this._swipeCurY,s=i-this._swipeStartX,r=n-this._swipeStartY;if(Math.abs(s)<10&&Math.abs(r)<10)return this._showNavChevrons(),void this._showPills();Math.abs(r)>Math.abs(s)||Math.abs(s)<45||this._selectMode||(s<0?(this._selectedIndex??0)<t-1&&(this._selectedIndex=(this._selectedIndex??0)+1):(this._selectedIndex??0)>0&&(this._selectedIndex=(this._selectedIndex??0)-1),this._pendingScrollToI=this._selectedIndex??0,this.requestUpdate(),this._showNavChevrons(),this._showPills())}_onThumbWheel(e){if(this._isThumbLayoutVertical())return;const t=e.currentTarget;if(!t)return;if(t.scrollWidth-t.clientWidth<=0)return;const i=Math.abs(e.deltaX||0),n=Math.abs(e.deltaY||0);let s=i>n?e.deltaX:e.deltaY;if(e.shiftKey&&n>0&&(s=e.deltaY),!Number.isFinite(s)||Math.abs(s)<.5)return;e.preventDefault(),e.stopPropagation();let r=s;1===e.deltaMode&&(r=16*s),2===e.deltaMode&&(r=s*t.clientWidth*.85),this._thumbWheelAccum=(this._thumbWheelAccum||0)+r,this._thumbWheelRaf||(this._thumbWheelRaf=requestAnimationFrame(()=>{this._thumbWheelRaf=null;const e=this._thumbWheelAccum||0;this._thumbWheelAccum=0;const i=t.scrollWidth-t.clientWidth;t.scrollLeft=Math.max(0,Math.min(i,t.scrollLeft+e))}))}setConfig(e){const t=this.config?{...this.config}:null,i=void 0!==e.autoplay?!!e.autoplay:he,n=void 0!==e.auto_muted?!!e.auto_muted:de,s=void 0!==e.live_auto_muted?!!e.live_auto_muted:ue,r=String(e.filename_datetime_format||"").trim(),o=(e,t,i)=>Math.min(i,Math.max(t,e)),a=(e,t)=>{if(null==e)return t;const i=Number(String(e).trim().replace("px","").replace("%",""));return Number.isFinite(i)?i:t},l=String(e.bar_position??"top").toLowerCase().trim(),c="bottom"===l?"bottom":"hidden"===l?"hidden":"top",d=Math.max(40,Math.min(220,a(e.thumb_size,86))),h=this._normThumbBarPosition(e.thumb_bar_position??"bottom"),p=this._normThumbLayout(e.thumb_layout??"horizontal"),u=o(a(e.bar_opacity,30),0,100),m=Math.round(o(a(e.thumbnail_frame_pct,0),0,100)),g=this._normMaxMedia(e.max_media??50);let _=this._normSourceMode(e.source_mode??"sensor");const v=this._normPreviewPosition(e.preview_position??"top"),b=String(e?.entity||"").trim(),f=this._sensorNormalizeEntities(e?.entities,b),y=String(e?.media_source||"").trim(),w=Array.isArray(e?.media_sources)?e.media_sources:Array.isArray(e?.media_folders_fav)?e.media_folders_fav:null,x=Array.isArray(w)?w.map(e=>String(e??"").trim()).filter(Boolean):[],S=this._normalizeVisibleObjectFilters(e.object_filters??me),k=this._normalizeEntityFilterMap(e.entity_filter_map||{});if(void 0!==e.source_mode&&null!==e.source_mode&&""!==String(e.source_mode).trim()||(_=!x.length&&!y||f.length?"sensor":"media"),"sensor"===_){if(!f.length)throw new Error("camera-gallery-card: 'entity' or 'entities' is required in source_mode: sensor")}else if("combined"===_){if(!f.length)throw new Error("camera-gallery-card: 'entity' or 'entities' is required in source_mode: combined");if(!y&&!x.length)throw new Error("camera-gallery-card: 'media_source' or 'media_sources' is required in source_mode: combined")}else if(!y&&!x.length)throw new Error("camera-gallery-card: 'media_source' OR 'media_sources' is required in source_mode: media");const $=void 0===e.allow_delete||!!e.allow_delete,A=void 0===e.allow_bulk_delete||!!e.allow_bulk_delete,C=e.delete_service&&String(e.delete_service).trim()||e.shell_command&&String(e.shell_command).trim()||"",L=void 0===e.delete_confirm||!!e.delete_confirm;let M=$,E=A,z=C;if(("sensor"===_||"combined"===_)&&$&&!C&&(E=!1,M=!1),"media"===_&&(M=!1,E=!1,z=""),z&&!/^[a-z0-9_]+\.[a-z0-9_]+$/i.test(z))throw new Error("camera-gallery-card: 'delete_service' must be 'domain.service'");const T=void 0!==e.clean_mode?!!e.clean_mode:void 0!==e.preview_click_to_open&&!!e.preview_click_to_open,P=void 0!==e.preview_close_on_tap?!!e.preview_close_on_tap:!!T,F="media"===_||"combined"===_?this._msNormalizeRoots(x.length?x:y):[],H=void 0!==e.live_enabled&&!!e.live_enabled,R=String(e.live_camera_entity||"").trim(),j=String(e.live_stream_url||"").trim(),I=String(e.live_stream_name||"").trim(),V=String(e.live_go2rtc_url||"").trim(),O=String(e.frigate_url||"").trim().replace(/\/+$/,""),D=Array.isArray(e.live_stream_urls)?e.live_stream_urls.filter(e=>e&&"object"==typeof e&&String(e.url||"").trim()).map(e=>({url:String(e.url).trim(),name:String(e.name||"").trim()||null})):[],B=Array.isArray(e.live_camera_entities)?e.live_camera_entities.map(String).map(e=>e.trim()).filter(Boolean):[],N=String(e.style_variables||"").trim(),q="contain"===e.object_fit?"contain":"cover",W=Math.max(10,Math.min(28,a(e.pill_size,14))),U={autoplay:i,auto_muted:n,live_auto_muted:s,allow_bulk_delete:E,allow_delete:M,bar_opacity:u,bar_position:c,delete_confirm:L,delete_service:z||"",entities:"sensor"===_||"combined"===_?f:[],entity:("sensor"===_||"combined"===_)&&f[0]||"",entity_filter_map:k,filename_datetime_format:r,live_camera_entities:B,live_camera_entity:R,live_enabled:H,live_stream_url:j||null,live_stream_name:I||null,live_stream_urls:D.length>0?D:null,live_go2rtc_url:V||null,frigate_url:O||null,max_media:g,media_source:"media"===_||"combined"===_?y:"",media_sources:"media"===_||"combined"===_?F:[],object_colors:"object"==typeof e.object_colors&&null!==e.object_colors?e.object_colors:{},object_filters:S,clean_mode:T,preview_close_on_tap:P,preview_position:v,aspect_ratio:["16:9","4:3","1:1"].includes(e.aspect_ratio)?e.aspect_ratio:"16:9",source_mode:_,start_mode:"live"===e.start_mode?"live":"gallery",style_variables:N,object_fit:q,persistent_controls:!0===e.persistent_controls,pill_size:W,thumb_bar_position:h,thumb_layout:p,thumb_size:d,thumbnail_frame_pct:m,live_go2rtc_stream:String(e.live_go2rtc_stream||"").trim()||null,folder_datetime_format:String(e.folder_datetime_format||"").trim()||null,sync_entity:String(e.sync_entity||"").trim()||null,menu_buttons:Array.isArray(e.menu_buttons)?e.menu_buttons.filter(e=>e&&"object"==typeof e&&e.entity&&e.icon).map(e=>({entity:String(e.entity).trim(),icon:String(e.icon).trim(),icon_on:e.icon_on?String(e.icon_on).trim():void 0,color_on:e.color_on?String(e.color_on).trim():void 0,color_off:e.color_off?String(e.color_off).trim():void 0,title:e.title?String(e.title).trim():void 0,service:e.service?String(e.service).trim():void 0,state_on:e.state_on?String(e.state_on).trim():void 0})):[],show_camera_title:!1!==e.show_camera_title,controls_mode:["overlay","fixed"].includes(e.controls_mode)?e.controls_mode:"overlay"};this.config=U,this._startMediaPoll();const K=t?this._configChangedKeys(t,U):[],Y=!t||this._isSourceConfigChange(K),Z=!!t&&this._isUiOnlyConfigChange(K);void 0===this._selectedIndex&&(this._selectedIndex=0),null==this._selectedSet&&(this._selectedSet=new Set),Array.isArray(this._objectFilters)||(this._objectFilters=[]),null==this._filterVideo&&(this._filterVideo=!1),null==this._filterImage&&(this._filterImage=!1);const X=new Set(this._getVisibleObjectFilters());this._objectFilters=this._objectFilters.filter(e=>X.has(e));if(!t||t.live_camera_entity!==R||t.live_stream_url!==e.live_stream_url||JSON.stringify(t.live_stream_urls)!==JSON.stringify(U.live_stream_urls)){const i=this._getLiveCameraOptions(),n=this._liveSelectedCamera&&i.some(e=>e===this._liveSelectedCamera);!n&&i.length>0&&(this._liveSelectedCamera=R||i[0]||""),t&&(this._aspectRatio=this._parseAspectRatio(e.aspect_ratio))}if(t)t.clean_mode!==this.config.clean_mode&&(this._previewOpen=!this.config.clean_mode);else{this._previewOpen=!this.config.clean_mode,this._showLivePicker=!1,this._showLiveQuickSwitch=!1,this._aspectRatio=this._parseAspectRatio(e.aspect_ratio);const t=U.entities.length>0||U.media_sources.length>0,i=U.start_mode;this._viewMode="live"===i&&U.live_enabled&&U.live_camera_entity?"live":"gallery"===i?"media":U.live_enabled&&U.live_camera_entity&&!t?"live":"media"}t&&t.sync_entity!==this.config.sync_entity&&(this._lastSyncedSrc=null),Y&&(this._closeThumbMenu(),this._forceThumbReset=!1,this._pendingScrollToI=0,this._previewOpen=!this.config.clean_mode,this._selectMode=!1,this._selectedIndex=0,this._selectedSet.clear(),this._hideBulkDeleteHint(),this._resetPosterQueue(),this._posterCache.clear(),this._posterPending.clear(),this._posterFailed.clear(),this._objectCache.clear());const Q=K.some(e=>["live_camera_entity","live_enabled"].includes(e));if(Q&&(this._hideLiveQuickSwitchButton(),this._liveCard=null,this._liveCardConfigKey="",this._liveWarmedUp=!1,this._signedWsPath=null),this._hasLiveConfig()||(this._hideLiveQuickSwitchButton(),this._showLivePicker=!1,this._viewMode="media"),"media"===this.config.source_mode||"combined"===this.config.source_mode){const e=t?this._msKeyFromRoots(t?.media_sources,t?.media_source):"",i=this._msKeyFromRoots(this.config?.media_sources,this.config?.media_source);(!t||Y&&e!==i)&&(this._ms.key="",this._msSetList([]),this._ms.loadedAt=0,this._ms.loading=!1,this._ms.roots=[],this._ms.urlCache=new Map,this._msResolveFailed=new Set,this._frigateSnapshots=[],this._snapshotCache=new Map,this._objectCache.clear())}t&&Z&&this.requestUpdate()}updated(e){const t=e.has("_selectedDay"),i=e.has("_objectFilters");if(this._forceThumbReset||t||i)this._forceThumbReset=!1,this._pendingScrollToI=null,this._resetThumbScrollToStart(),this._revealedThumbs.clear(),this._msResolveFailed=new Set,this._thumbObserver&&(this._thumbObserver.disconnect(),this._thumbObserver=null,this._thumbObserverRoot=null,this._observedThumbs=new WeakSet);else if(null!=this._pendingScrollToI){const e=this._pendingScrollToI;this._pendingScrollToI=null,this._scrollThumbIntoView(e)}e.has("config")&&this._previewVideoEl&&(this._previewVideoEl.autoplay=!0===this.config?.autoplay,this._previewVideoEl.muted=void 0===this.config?.auto_muted||!0===this.config.auto_muted);const n="media"===this.config?.source_mode||"combined"===this.config?.source_mode,s=this._items();if(s.length){const e=s.map((e,t)=>{const i=this._dtMsFromSrc(e);return{dayKey:this._extractDayKey(e),dtMs:i,idx:t,src:e}});e.sort((e,t)=>{const i=Number.isFinite(e.dtMs),n=Number.isFinite(t.dtMs);return i&&n&&t.dtMs!==e.dtMs?t.dtMs-e.dtMs:i&&!n?-1:!i&&n?1:t.idx-e.idx});const t=e.map(e=>({dayKey:e.dayKey,src:e.src})),i=this._uniqueDays(t)[0]??null,r=this._selectedDay??i,o=r?t.filter(e=>e.dayKey===r):t,a=o.filter(e=>this._matchesObjectFilter(e.src)),l=this._normMaxMedia(this.config?.max_media),c=a.slice(0,Math.min(l,a.length)),d=this._getThumbRenderLimit(l,n),h=c.length?Math.min(Math.max(this._selectedIndex??0,0),c.length-1):0,p=c.length?c[h]?.src:"";this._syncCurrentMedia(p),this._scheduleVisibleMediaWork(p,c,h,n);const u=c.slice(0,d),m=c.slice(0,Math.min(c.length,d+6));this._queueSnapshotResolveForVisibleThumbs(u),this._queueSensorPosterWork(m)}this._isLiveActive()?this._mountLiveCard():(this._syncPreviewPlaybackFromState(),!this._liveWarmedUp&&this._hasLiveConfig()&&(this._liveWarmedUp=!0,this._warmupLiveCard())),this._setupThumbObserver()}_setupThumbObserver(){const e=this.shadowRoot?.querySelector(".tthumbs");if(e){if(this._thumbObserver&&this._thumbObserverRoot!==e&&(this._thumbObserver.disconnect(),this._thumbObserver=null,this._thumbObserverRoot=null,this._observedThumbs=new WeakSet),!this._thumbObserver){this._thumbObserverRoot=e;const t=e.classList.contains("horizontal")?"0px 200px 0px 200px":"200px 0px 200px 0px";this._thumbObserver=new IntersectionObserver(e=>{let t=!1;const i="sensor"===this.config?.source_mode||"combined"===this.config?.source_mode;for(const n of e)if(n.isIntersecting){const e=n.target.dataset.lazySrc;e&&!this._revealedThumbs.has(e)&&(this._revealedThumbs.add(e),t=!0),i&&e&&this._isVideo(e)&&this._enqueuePoster(e)}t&&this.requestUpdate()},{root:e,rootMargin:t,threshold:0})}e.querySelectorAll(".tthumb[data-lazy-src]").forEach(e=>{this._observedThumbs.has(e)||(this._thumbObserver.observe(e),this._observedThumbs.add(e))})}}render(){if(!this._hass||!this.config)return B``;const e="media"===this.config?.source_mode||"combined"===this.config?.source_mode,t="1 / 1",i=this._items(),n=this._getVisibleObjectFilters();if(!i.length)return e&&this._ms?.loading?B`<div class="empty">Loading media…</div>`:B`<div class="empty">No media found.</div>`;const s=i.map((e,t)=>{const i=this._dtMsFromSrc(e);return{dayKey:this._extractDayKey(e),dtMs:i,idx:t,src:e}});s.sort((e,t)=>{const i=Number.isFinite(e.dtMs),n=Number.isFinite(t.dtMs);return i&&n&&t.dtMs!==e.dtMs?t.dtMs-e.dtMs:i&&!n?-1:!i&&n?1:t.idx-e.idx});const r=s.map(e=>({dayKey:e.dayKey,src:e.src})),o=this._uniqueDays(r),a=o[0]??null,l=this._selectedDay??a,c=l?r.filter(e=>e.dayKey===l):r,d=c.filter(e=>this._matchesObjectFilter(e.src)),h=d.filter(e=>this._isVideoForSrc(e.src)).length,p=d.filter(e=>!this._isVideoForSrc(e.src)).length,u=h>0&&p>0;u||(this._filterVideo=!1,this._filterImage=!1);const m=d.filter(e=>this._matchesTypeFilter(e.src)),g=!m.length,_=this._normMaxMedia(this.config?.max_media),v=g?[]:m.slice(0,Math.min(_,m.length));v.length?(this._selectedIndex??0)>=v.length&&(this._selectedIndex=0):this._selectedIndex=0;const b=v.length?Math.min(Math.max(this._selectedIndex??0,0),v.length-1):0,f=v.length?v[b]?.src:"",y=this._getThumbRenderLimit(_,e),w=v.length?v.slice(0,y).map((e,t)=>({...e,i:t})):[];let x=f;this._isMediaSourceId(f)&&(x=this._ms.urlCache.get(f)||"");let S="",k="",$="";if(e&&this._isMediaSourceId(f)){const e=this._msMetaById(f);S=e.mime,k=e.cls,$=e.title}const A=!!f&&this._isVideoSmart(x||$,S,k),C=f?this._extractDateTimeKey(f):"",L=C?this._formatDateTime(C):"";f&&(L||this._tsLabelFromFilename(f));const M=l??a,E=M?o.indexOf(M):-1,z=E>=0&&E<o.length-1,T=E>0,P=M===a,F=this._serviceParts(),H=!("sensor"!==this.config?.source_mode&&"combined"!==this.config?.source_mode||!this.config?.allow_delete||!F);("sensor"===this.config?.source_mode||"combined"===this.config?.source_mode)&&this.config;const R=this._isLiveActive()||"bottom"===this.config.bar_position?"bottom":"hidden"===this.config.bar_position?"hidden":"top",j=!!this.config?.clean_mode,I=!j||!!this._previewOpen,V="bottom"===this.config?.preview_position,O=!!f&&e&&this._isMediaSourceId(f),D=!(!f||O&&!x),N=this._hasLiveConfig(),q=this._isLiveActive(),W=I||q,U=u&&navigator.maxTouchPoints>0,K=this._isThumbLayoutVertical(),Y=!this.config?.clean_mode||!this._previewOpen&&!q,Z=`\n      --gap:10px; --r:10px;\n      --barOpacity:${this.config.bar_opacity};\n      --thumbRowH:${this.config.thumb_size}px;\n      --thumbEmptyH:${this.config.thumb_size}px;\n      --topbarMar:${ge};\n      --topbarPad:${_e};\n      --thumbsMaxHeight:320px;\n      --cgc-object-fit:${this.config.object_fit||"cover"};\n      --cgc-pill-size:${this.config.pill_size}px;\n      ${this.config.style_variables||""}\n    `,X="fixed"===this.config.controls_mode,Q=B`
      <div class="gallery-pills-left">
        ${j?B`
          <button class="gallery-pill live-pill-btn" @pointerdown=${e=>e.stopPropagation()} @click=${e=>{e.stopPropagation(),this._setViewMode("media"),this._previewOpen=!1,this.requestUpdate()}}>
            <ha-icon icon="mdi:arrow-left"></ha-icon>
          </button>
        `:B``}
      </div>
    `,J=B`
      <div class="gallery-pills-center">
        ${(()=>{const e=this._objectForSrc(f),t=e?this._objectIcon(e):null;return t?B`<div class="gallery-pill live-pill-btn" style="flex-shrink:0;width:calc(var(--cgc-pill-size,14px)*1.6 + 2px);height:calc(var(--cgc-pill-size,14px)*1.6 + 2px);padding:0"><ha-icon icon="${t}"></ha-icon></div>`:B``})()}
        <div class="gallery-pill live-pill-btn" style="flex-shrink:0;min-width:calc(var(--cgc-pill-size,14px)*1.6 + 2px);height:calc(var(--cgc-pill-size,14px)*1.6 + 2px);padding:0 8px;overflow:hidden"><span style="font-size:calc(var(--cgc-pill-size,14px) - 6px)">${b+1}/${v.length}</span></div>
      </div>
    `,G=B`
      <div class="gallery-pills-right">
        ${A||!D||g?B``:B`
          <button class="gallery-pill live-pill-btn" @pointerdown=${e=>e.stopPropagation()} @click=${e=>{e.stopPropagation(),this._openImageFullscreen()}}>
            <ha-icon icon="mdi:fullscreen"></ha-icon>
          </button>
        `}
      </div>
    `,ee=B`
      <div class="live-pills-left">
        ${j?B`
          <button class="gallery-pill live-pill-btn" @pointerdown=${e=>e.stopPropagation()} @click=${e=>{e.stopPropagation(),this._setViewMode("media"),this._previewOpen=!1,this.requestUpdate()}}>
            <ha-icon icon="mdi:arrow-left"></ha-icon>
          </button>
        `:B``}
        ${!1!==this.config.show_camera_title&&"fixed"!==this.config.controls_mode?B`<div class="gallery-pill"><span>${this._friendlyCameraName(this._getEffectiveLiveCamera())}</span></div>`:B``}
      </div>
    `,te=B`
      <div class="live-pills-right">
        <button class="gallery-pill live-pill-btn" @pointerdown=${e=>e.stopPropagation()} @click=${e=>{e.stopPropagation(),this._toggleLiveMute()}}>
          <ha-icon icon=${this._liveMuted?"mdi:volume-off":"mdi:volume-high"}></ha-icon>
        </button>
        ${this._getLiveCameraOptions().length>1?B`
          <button class="gallery-pill live-pill-btn" @pointerdown=${e=>e.stopPropagation()} @click=${e=>{e.stopPropagation(),this._openLivePicker()}}>
            <ha-icon icon="mdi:cctv"></ha-icon>
          </button>
        `:B``}
        <button class="gallery-pill live-pill-btn" @pointerdown=${e=>e.stopPropagation()} @click=${e=>{e.stopPropagation(),this._toggleLiveFullscreen()}}>
          <ha-icon icon=${document.fullscreenElement||document.webkitFullscreenElement||this._liveFullscreen?"mdi:fullscreen-exit":"mdi:fullscreen"}></ha-icon>
        </button>
        ${(this.config.menu_buttons??[]).length?B`
          <div class="live-hamburger-wrap" @pointerdown=${e=>e.stopPropagation()}>
            <button class="gallery-pill live-pill-btn ${this._hamburgerOpen?"active":""}" @click=${e=>{e.stopPropagation(),this._hamburgerOpen=!this._hamburgerOpen,this._hamburgerOpen||this._showPills(2500)}}>
              <ha-icon icon="mdi:menu"></ha-icon>
            </button>
          </div>
        `:B``}
      </div>
    `,ie=(this.config.menu_buttons??[]).length&&this._hamburgerOpen?B`
      <div class="live-menu-backdrop" @pointerdown=${e=>e.stopPropagation()} @click=${()=>{this._hamburgerOpen=!1,this._showPills(2500)}}></div>
      <div class="live-menu-panel" @pointerdown=${e=>e.stopPropagation()}>
        ${(this.config.menu_buttons??[]).map(e=>{const t=this._hass?.states[e.entity],i=t?.state??"",n=new Set(["on","open","opening","unlocked","playing","paused","home","true","heat","cool","heat_cool","fan_only","dry","auto"]),s=e.state_on?i===e.state_on:n.has(i),r=e.entity.split(".")[0],[o,a]=e.service?e.service.split("."):"automation"===r?["automation","trigger"]:"script"===r?["script","turn_on"]:["homeassistant","toggle"],l=s&&e.icon_on?e.icon_on:e.icon,c=s?e.color_on||"":e.color_off||"",d=e.title||t?.attributes?.friendly_name||e.entity;return B`
            <button class="live-menu-panel-btn ${s?"active":""}"
              @click=${()=>this._hass?.callService(o,a,{entity_id:e.entity})}
              title="${d}">
              <div class="panel-btn-icon" style="${c?`background:${c}`:""}">
                <ha-icon icon="${l}"></ha-icon>
              </div>
              <span class="live-menu-panel-lbl">${d}</span>
            </button>
          `})}
      </div>
    `:B``,ne=W?B`
          <div
            class="preview"
            style="aspect-ratio:${this._aspectRatio||"16/9"}; touch-action:${q?"auto":"pan-y"};"
            @pointerdown=${e=>{if(!1===e?.isPrimary)return;const t=e.composedPath?.()||[];if(!(this._isLiveActive()||this._isInsideTsbar(e)||this._pathHasClass(t,"pnavbtn")||t.some(e=>"VIDEO"===e?.tagName)||this._pathHasClass(t,"live-picker")||this._pathHasClass(t,"live-picker-backdrop")||this._pathHasClass(t,"live-quick-switch"))){e.preventDefault?.(),e.stopPropagation?.(),e.stopImmediatePropagation?.();try{e.currentTarget?.blur?.()}catch(e){}}this._onPreviewPointerDown(e)}}
            @pointermove=${e=>{"mouse"!==e.pointerType||this._swiping||this._showNavChevrons(),this._swiping&&!1!==e.isPrimary&&(this._swipeCurX=e.clientX,this._swipeCurY=e.clientY)}}
            @pointerup=${e=>this._onPreviewPointerUp(e,v.length)}
            @pointercancel=${e=>this._onPreviewPointerUp(e,v.length)}
            @pointerenter=${e=>{"mouse"===e.pointerType&&(this._showPillsHover(),this._showNavChevrons())}}
            @pointerleave=${e=>{"mouse"===e.pointerType&&this._hidePillsHover()}}
            @click=${e=>this._onPreviewClick(e)}
          >
            ${q?this._renderLiveInner():g?B`<div class="preview-empty">No media for this day.</div>`:D?A?B`<div id="preview-video-host" class="preview-video-host"></div>`:B`<img class="pimg" src=${x} alt="" />`:B`<div class="empty inpreview">Loading...</div>`}
            ${this._hasLiveConfig()?B`<div id="live-card-host" class="live-card-host${q?"":" live-host-hidden"}"></div>`:B``}

            ${!g&&!q&&v.length>1&&this._showNav?B`
              <div class="pnav">
                <button class="pnavbtn left" ?disabled=${b<=0} @click=${e=>{e.stopPropagation(),this._navPrev()}}>
                  <ha-icon icon="mdi:chevron-left"></ha-icon>
                </button>
                <button class="pnavbtn right" ?disabled=${b>=v.length-1} @click=${e=>{e.stopPropagation(),this._navNext(v.length)}}>
                  <ha-icon icon="mdi:chevron-right"></ha-icon>
                </button>
              </div>
            `:B``}

            ${q&&this._getLiveCameraOptions().length>1&&(this._pillsVisible||this.config?.persistent_controls)?B`
              <div class="pnav">
                <button class="pnavbtn left" @pointerdown=${e=>e.stopPropagation()} @click=${e=>{e.stopPropagation(),this._navLiveCamera(-1)}}>
                  <ha-icon icon="mdi:chevron-left"></ha-icon>
                </button>
                <button class="pnavbtn right" @pointerdown=${e=>e.stopPropagation()} @click=${e=>{e.stopPropagation(),this._navLiveCamera(1)}}>
                  <ha-icon icon="mdi:chevron-right"></ha-icon>
                </button>
              </div>
            `:B``}

            ${q||X||"hidden"===R?B``:B`
              <div class="gallery-pills ${R} ${this._pillsVisible||this.config?.persistent_controls?"visible":""}">
                ${Q}${J}${G}
              </div>
            `}
            ${q&&!X?B`
              <div class="live-controls-bar ${this._pillsVisible||this._showLivePicker||this.config?.persistent_controls?"visible":""}">
                <div class="live-controls-main">
                  ${ee}${te}
                </div>
              </div>
            `:B``}
            ${q?ie:B``}
          </div>
        `:B``,se=X&&W?B`
      <div class="controls-bar-fixed">
        ${q?B`
          <div class="live-controls-main live-controls-main--fixed">
            ${ee}${te}
          </div>
        `:"hidden"!==R?B`
          ${Q}${J}${G}
        `:B``}
      </div>
    `:B``,re=n.length?B`
          <div class="objfilters" role="group" aria-label="Object filters">
            ${n.map(e=>{const t=this._objectIcon(e),i=this._filterLabel(e),n=this._objectColor(e);return B`
                <button
                  class="objbtn icon-only ${this._isObjectFilterActive(e)?"on":""}"
                  @click=${()=>this._setObjectFilter(e)}
                  title="Filter ${i}"
                  aria-label="Filter ${i}"
                >
                  ${t?B`<ha-icon icon="${t}" style="color:${n}"></ha-icon>`:B``}
                </button>
              `})}
          </div>
        `:B``,oe=B`
      <div class="timeline ${g?"timeline-empty":""}">
        ${this._selectMode&&this._selectedSet?.size?B`
              <div class="bulkbar topbulk">
                <div class="bulkbar-left">
                  <div class="bulkbar-text">
                    ${this._selectedSet.size} selected
                  </div>
                </div>

                <div class="bulkactions">
                  <button
                    type="button"
                    class="bulkaction bulkcancel"
                    title="Cancel"
                    aria-label="Cancel"
                    @click=${e=>{e.preventDefault(),e.stopPropagation(),this._exitSelectMode()}}
                  >
                    <ha-icon icon="mdi:close"></ha-icon>
                    <span>Cancel</span>
                  </button>

                  <button
                    type="button"
                    class="bulkaction bulkdelete"
                    title="Delete"
                    aria-label="Delete"
                    ?disabled=${!H}
                    @click=${async e=>{e.preventDefault(),e.stopPropagation(),await this._bulkDelete(this._selectedSet)}}
                  >
                    <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            `:B``}

        <div
          class="tthumbs-wrap ${K?"vertical":"horizontal"} ${g?"empty":""}"
        >
          ${w.length?B`
                <div
                  class="tthumbs ${K?"vertical":"horizontal"}"
                  style="--tgap:${2}px;"
                  @wheel=${K?null:this._onThumbWheel}
                >
                  ${w.map(i=>{const n=i.i===b&&!q,s=this._selectedSet?.has(i.src),r=e&&this._isMediaSourceId(i.src);let o=i.src;r&&(o=this._ms.urlCache.get(i.src)||"");let a="",l="",c="",d="";if(r){const e=this._msMetaById(i.src);a=e.mime,l=e.cls,c=e.title,d=e.thumb}const h=this._isVideoSmart(o||c,a,l);let p=h?this._resolveVideoPoster(i,r,o,d,x):o;!h&&!p&&r&&d&&(p=this._posterCache.get(d)||"",p||this._enqueuePoster(d));const u=!r||!!o||!!d,m=r?u&&!!p:this._revealedThumbs.has(i.src)&&u&&!!p,g=this._dtMsFromSrc(i.src),_=this._formatTimeFromMs(g),v=this._objectForSrc(i.src),f=this._objectIcon(v),y=this._objectColor(v),w=_,S=this.config?.thumb_bar_position||"bottom",k=!("hidden"===S||!w&&!f),$=K?`aspect-ratio:${t};border-radius:var(--cgc-thumb-radius, 10px);`:`width:${this.config.thumb_size}px;aspect-ratio:${t};border-radius:var(--cgc-thumb-radius, 10px);`;return B`
                      <button
                        class="tthumb ${n?"on":""} ${this._selectMode&&s?"sel":""}"
                        data-i="${i.i}"
                        data-lazy-src="${i.src}"
                        style="${$}"
                        @pointerdown=${e=>{e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation?.(),e.currentTarget?.blur?.(),this._onThumbPointerDown(e,i)}}
                        @pointermove=${e=>this._onThumbPointerMove(e)}
                        @pointerup=${()=>this._onThumbPointerUp()}
                        @pointercancel=${()=>this._onThumbPointerCancel()}
                        @pointerleave=${()=>this._onThumbPointerCancel()}
                        @contextmenu=${e=>this._onThumbContextMenu(e,i)}
                        @click=${e=>{e.preventDefault(),e.stopPropagation(),this._suppressNextThumbClick?this._suppressNextThumbClick=!1:this._selectMode?this._toggleSelected(i.src):(this._isLiveActive()&&this._setViewMode("media"),this.config?.clean_mode&&(i.i===this._selectedIndex?this._previewOpen=!this._previewOpen:this._previewOpen=!0),this._pendingScrollToI=i.i,this._selectedIndex=i.i,this.requestUpdate())}}
                      >
                        ${m?B`<img
                              class="timg"
                              src="${p}"
                              alt=""
                            />`:B`<div class="tph" aria-hidden="true"></div>`}

                        ${h?B`
                              <div
                                class="video-overlay ${"bottom"===S?"has-bottom-bar":"top"===S?"has-top-bar":""}"
                              >
                                <ha-icon icon="mdi:play"></ha-icon>
                              </div>
                            `:B``}

                        ${k?B`
                              <div class="tbar ${S}">
                                <div class="tbar-left">${w||"—"}</div>
                                ${f?B`
                                      <ha-icon
                                        class="tbar-icon"
                                        icon="${f}"
                                        style="color:${y}"
                                      ></ha-icon>
                                    `:B``}
                              </div>
                            `:B``}

                        ${this._selectMode?B`
                              <div class="selOverlay ${s?"on":""}">
                                <ha-icon icon="mdi:check"></ha-icon>
                              </div>
                            `:B``}
                      </button>
                    `})}
                </div>
              `:g?B`
                  <div class="thumbs-empty-state">
                    No ${this._filterLabelList(this._objectFilters)} media for this day.
                  </div>
                `:B``}
        </div>
      </div>
    `;return B`
      <div class="root" style="${Z}">
        <div class="panel" style="width:${"100%"}; margin:0 auto;">
          ${!V&&W?B`${ne}${se}${Y&&!X?B`<div class="divider"></div>`:B``}`:B``}

          ${Y?B`
            <div class="topbar">
              <div class="seg" role="tablist" aria-label="Filter">
                <button
                  class="segbtn ${P?"on":""}"
                  @click=${()=>{this._selectedDay=a,this._selectedIndex=0,this._pendingScrollToI=null,this._forceThumbReset=!0,this._exitSelectMode(),this.config?.clean_mode&&(this._previewOpen=!1),this._isLiveActive()&&this._setViewMode("media"),this.requestUpdate()}}
                  title="Today"
                  role="tab"
                  aria-selected=${P}
                >
                  <span>Today</span>
                </button>
              </div>

              ${U?B`
                <div class="datepill has-filters" role="group" aria-label="Day navigation">
                  <div class="dateinfo datepick" @click=${()=>this._openDatePicker(o)} title="Select date">
                    <span class="txt">${M?this._formatDay(M):"—"}</span>
                  </div>
                </div>
              `:B`
                <div class="datepill" role="group" aria-label="Day navigation">
                  <button class="iconbtn" ?disabled=${!z} @click=${()=>this._stepDay(1,o,M)} aria-label="Previous day" title="Previous day">
                    <ha-icon icon="mdi:chevron-left"></ha-icon>
                  </button>
                  <div class="dateinfo" title="Selected day">
                    <span class="txt">${M?this._formatDay(M):"—"}</span>
                  </div>
                  <button class="iconbtn" ?disabled=${!T} @click=${()=>this._stepDay(-1,o,M)} aria-label="Next day" title="Next day">
                    <ha-icon icon="mdi:chevron-right"></ha-icon>
                  </button>
                </div>
              `}

              ${u?B`
                <div class="seg" style="${q?"opacity:0.35;pointer-events:none":""}">
                  <button class="segbtn ${this._filterVideo?"on":""}" @click=${()=>this._toggleFilterVideo()} title="Videos" style="border-radius:10px 0 0 10px">
                    <ha-icon icon="mdi:video" style="--mdc-icon-size:16px"></ha-icon>
                  </button>
                  <button class="segbtn ${this._filterImage?"on":""}" @click=${()=>this._toggleFilterImage()} title="Photos" style="border-radius:0 10px 10px 0">
                    <ha-icon icon="mdi:image" style="--mdc-icon-size:16px"></ha-icon>
                  </button>
                </div>
              `:B``}

              ${N?B`
                    <div class="seg">
                      <button
                        class="segbtn livebtn ${q?"on":""}"
                        title="${q?"Close live":"Open live"}"
                        @click=${e=>{e.preventDefault(),e.stopPropagation(),this._toggleLiveMode()}}
                      >
                        <span>LIVE</span>
                      </button>
                    </div>
                  `:B``}
            </div>

            ${n.length?B`
                  <div class="divider"></div>
                  ${re}
                `:B``}

            ${oe}
          `:B``}

          ${V&&W?B`${Y&&!X?B`<div class="divider"></div>`:B``}${ne}${se}`:B``}
        </div>

        ${this._showBulkHint&&this._selectMode?B`
              <div class="bulk-floating-hint">
                Select thumbnails to delete
              </div>
            `:B``}

        ${this._renderDatePicker()}

        ${this._renderThumbActionSheet()}

        ${this._imgFsOpen&&x?B`
          <div class="img-fs-overlay" @click=${()=>this._closeImageFullscreen()}>
            <img src=${x} alt="" @click=${e=>e.stopPropagation()} />
            <button class="img-fs-close" @pointerdown=${e=>e.stopPropagation()} @click=${e=>{e.stopPropagation(),this._closeImageFullscreen()}}>
              <ha-icon icon="mdi:fullscreen-exit"></ha-icon>
            </button>
          </div>
        `:B``}

      </div>
    `}static get styles(){return r`
      /*
      * ──────────────────────────────────────────────────────────────
      * Theme tokens
      * ──────────────────────────────────────────────────────────────
      */
      :host {
        display: block;

        /* ── text ── */
        --cgc-txt:          var(--primary-text-color,   rgba(0,0,0,0.87));
        --cgc-txt2:         var(--secondary-text-color, rgba(0,0,0,0.60));
        --cgc-txt-dis:      var(--disabled-text-color,  rgba(0,0,0,0.38));

        /* ── surfaces ── */
        --cgc-card-bg:      var(--card-background-color, #fff);
        --cgc-preview-bg:   var(--card-background-color, #fff);

        /* ── controls / chrome ── */
        --cgc-ui-bg:        var(--secondary-background-color, rgba(0,0,0,0.08));
        --cgc-ui-stroke:    var(--divider-color,              rgba(0,0,0,0.12));
        --cgc-divider:      var(--divider-color,              rgba(0,0,0,0.10));
        --cgc-thumb-bg:     var(--secondary-background-color, rgba(0,0,0,0.06));
        --cgc-tbar-bg:      var(--secondary-background-color, rgba(0,0,0,0.16));
        --cgc-pill-bg:      var(--secondary-background-color, rgba(0,0,0,0.45));

        /* ── nav overlay buttons ── */
        --cgc-nav-bg:       rgba(0,0,0,0.18);
        --cgc-nav-border:   rgba(0,0,0,0.18);

        /* ── selection overlay ── */
        --cgc-sel-ov-a:     rgba(0,0,0,0.10);
        --cgc-sel-ov-b:     rgba(0,0,0,0.22);

        /* ── bulk bar ── */
        --cgc-bulk-bg:      var(--secondary-background-color, rgba(0,0,0,0.06));
        --cgc-bulk-border:  var(--divider-color,              rgba(0,0,0,0.10));

        --cgc-ts-r: 0;
        --cgc-ts-g: 0;
        --cgc-ts-b: 0;
        --cgc-tsbar-txt: #fff;
        --cgc-pill-bg: #000;
      }

      @media (prefers-color-scheme: dark) {
        :host {
          --cgc-nav-bg:     rgba(0,0,0,0.45);
          --cgc-nav-border: rgba(255,255,255,0.18);
          --cgc-sel-ov-a:   rgba(0,0,0,0.18);
          --cgc-sel-ov-b:   rgba(0,0,0,0.32);
        }
      }

      :host-context(.dark-mode) {
        --cgc-nav-bg:     rgba(0,0,0,0.45);
        --cgc-nav-border: rgba(255,255,255,0.18);
        --cgc-sel-ov-a:   rgba(0,0,0,0.18);
        --cgc-sel-ov-b:   rgba(0,0,0,0.32);
      }

      /* ──────────────────────────────────────────────────────────── */

      .root {
        display: block;
        background: transparent;
        border-radius: 0;
        min-height: 0;
        padding: 0;
        position: relative;
      }

      :host([data-live-fs]) {
        position: fixed !important;
        inset: 0 !important;
        z-index: 9999 !important;
        width: 100vw !important;
        height: 100vh !important;
      }

      :host([data-live-fs]) .root {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #000;
      }

      :host([data-live-fs]) .panel {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        border-radius: 0 !important;
      }

      :host([data-live-fs]) .preview {
        flex: 1 !important;
        height: auto !important;
        min-height: 0;
        border-radius: 0 !important;
        overflow: hidden;
      }

      :host([data-live-fs]) .divider,
      :host([data-live-fs]) .objfilters,
      :host([data-live-fs]) .tthumbs,
      :host([data-live-fs]) .datepill,
      :host([data-live-fs]) .seg {
        display: none !important;
      }

      .panel {
        background: var(--cgc-card-bg, var(--card-background-color, #fff));
        border: 1px solid
          var(--cgc-card-border-color, var(--divider-color, rgba(0,0,0,0.12)));
        border-radius: var(--r);
        box-sizing: border-box;
        padding: var(--cardPad, 4px 4px);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .divider {
        display: none;
      }

      .preview {
        position: relative;
        -webkit-mask-image: -webkit-radial-gradient(white, black);
        background: var(--cgc-preview-bg);
        border-radius: var(--r);
        overflow: hidden;
        transform: translateZ(0);
        width: 100%;
      }

      .pimg {
        display: block;
        height: 100%;
        object-fit: var(--cgc-object-fit, cover);
        width: 100%;
        pointer-events: none;
      }

      .img-fs-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: #000;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100dvw;
        height: 100dvh;
      }
      .img-fs-overlay img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
      .img-fs-close {
        position: absolute;
        top: 12px;
        right: 12px;
        background: rgba(0,0,0,0.5);
        border: none;
        border-radius: 50%;
        color: #fff;
        cursor: pointer;
        padding: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .live-stage {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
      .live-offline {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        background: #000;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .live-offline-img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: grayscale(100%) opacity(0.35);
      }
      .live-offline-badge {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        color: rgba(255,255,255,0.75);
        font-size: 13px;
        font-weight: 600;
      }
      .live-offline-badge ha-icon {
        --ha-icon-size: 36px;
        --mdc-icon-size: 36px;
        width: 36px;
        height: 36px;
      }
      .live-offline-state {
        font-size: 11px;
        font-weight: 400;
        opacity: 0.6;
      }

      .live-card-host {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        background: transparent;
        border-radius: inherit;
        overflow: hidden;
      }

      .live-host-hidden {
        display: none;
      }

      .live-card-host > * {
        width: 100% !important;
        height: 100% !important;
        display: block !important;
      }

      .live-card-host ha-card {
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        box-shadow: none !important;
        background: transparent !important;
        border-radius: 0 !important;
        overflow: hidden !important;
      }

      .live-card-host video {
        width: 100% !important;
        height: 100% !important;
        object-fit: var(--cgc-object-fit, cover) !important;
      }

      .segbtn.livebtn {
        width: 60px;
      }

      .segbtn.livebtn.on {
        background: var(--cgc-live-active-bg, var(--error-color, #c62828));
        color: var(--text-primary-color, #fff);
      }

      .preview-video-host {
        position: relative;
        width: 100%;
        height: 100%;
      }

      .preview-video-host > video {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: var(--cgc-object-fit, cover);
        pointer-events: auto;
      }




      @keyframes livePulse {
        0% {
          transform: scale(0.95);
          box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.55);
        }
        70% {
          transform: scale(1);
          box-shadow: 0 0 0 8px rgba(255, 255, 255, 0);
        }
        100% {
          transform: scale(0.95);
          box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
        }
      }

      .live-picker-backdrop {
        position: absolute;
        inset: 0;
        z-index: 23;
        background: rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
      }

      .live-picker {
        position: relative;
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: min(78%, 360px);
        max-height: min(80%, 500px);
        overflow: hidden;
        border-radius: 18px;
        z-index: 24;
        background: var(--card-background-color, rgba(24,24,28,0.94));
        border: 1px solid var(--divider-color, rgba(255,255,255,0.10));
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.34);
        color: var(--primary-text-color);

        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
      }

      .live-picker::before {
        content: '';
        position: absolute;
        inset: 0;
        background: var(--cgc-pill-bg, #000);
        opacity: calc(var(--barOpacity, 30) / 100);
        backdrop-filter: blur(4px);
        z-index: 0;
        pointer-events: none;
        border-radius: inherit;
      }

      .live-picker-head,
      .live-picker-list {
        position: relative;
        z-index: 1;
      }

      .live-picker-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 18px;
        border-bottom: 1px solid var(--divider-color, rgba(255,255,255,0.08));
      }

      .tthumbs-wrap {
        width: calc(100% + 8px);
        box-sizing: border-box;
        margin-top: 0;
        margin-left: -4px;
        margin-right: -4px;
      }

      .tthumbs-wrap.horizontal {
        min-height: var(--thumbRowH, 86px);
      }

      .tthumbs-wrap.vertical {
        min-height: var(--thumbsMaxHeight, 320px);
      }

      .tthumbs-wrap.empty.horizontal {
        height: var(--thumbEmptyH, 86px);
        min-height: var(--thumbEmptyH, 86px);
        max-height: var(--thumbEmptyH, 86px);
        display: flex;
        align-items: stretch;
        background: transparent;
      }

      .tthumbs-wrap.empty.vertical {
        min-height: var(--thumbsMaxHeight, 320px);
        display: flex;
        align-items: stretch;
        background: transparent;
      }

      .thumbs-empty-state {
        width: 100%;
        height: 100%;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 0 16px;
        box-sizing: border-box;
        border-radius: 14px;
        background: transparent;
        color: var(--cgc-txt);
        font-size: 14px;
        font-weight: 700;
      }

      .live-picker-title {
        font-size: 16px;
        font-weight: 900;
        color: var(--primary-text-color);
      }

      .live-picker-close {
        width: 36px;
        height: 36px;
        border-radius: 999px;
        border: 0;
        background: var(--cgc-ui-bg);
        color: var(--primary-text-color);
        display: grid;
        place-items: center;
        cursor: pointer;
        padding: 0;
      }

      .live-picker-close ha-icon {
        --ha-icon-size: 18px;
        --mdc-icon-size: var(--ha-icon-size);
        width: var(--ha-icon-size);
        height: var(--ha-icon-size);
      }

      .live-picker-list {
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        display: flex;
        flex-direction: column;
      }

      .live-picker-item {
        width: 100%;
        border: 0;
        background: transparent;
        color: var(--primary-text-color);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 16px 18px;
        cursor: pointer;
        text-align: left;
        border-top: 1px solid var(--divider-color, rgba(255,255,255,0.05));
      }

      .live-picker-item:first-child {
        border-top: 0;
      }

      .live-picker-item:hover {
        background: var(--cgc-ui-bg);
      }

      .live-picker-item.on {
        background: rgba(var(--rgb-primary-color, 33,150,243), 0.16);
      }

      .live-picker-item-left {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        flex: 1 1 auto;
      }

      .live-picker-item-left ha-icon {
        --ha-icon-size: 20px;
        --mdc-icon-size: var(--ha-icon-size);
        width: var(--ha-icon-size);
        height: var(--ha-icon-size);
        color: var(--primary-color, #4da3ff);
        flex: 0 0 auto;
      }

      .live-picker-item-name {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .live-picker-item-name span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .live-picker-item-name span:first-child {
        font-size: 15px;
        font-weight: 800;
      }

      .live-picker-item-entity {
        font-size: 11px;
        font-weight: 500;
        opacity: 0.55;
      }

      .live-picker-check {
        --ha-icon-size: 22px;
        --mdc-icon-size: var(--ha-icon-size);
        width: var(--ha-icon-size);
        height: var(--ha-icon-size);
        color: var(--primary-color, #4da3ff);
        flex: 0 0 auto;
      }

      .preview-empty {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 24px;
        box-sizing: border-box;
        color: var(--cgc-txt);
        font-size: 15px;
        font-weight: 700;
        background: var(--cgc-preview-bg);
      }

      .objfilters {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
        gap: 6px;
        width: 100%;
      }

      .objbtn {
        width: 100%;
        height: 28px;
        border: 0;
        border-radius: var(--cgc-obj-btn-radius, 10px);
        padding: 0;
        background: var(--cgc-obj-btn-bg, var(--cgc-ui-bg));
        color: var(--cgc-obj-icon-color, var(--cgc-txt));
        display: grid;
        place-items: center;
        cursor: pointer;
      }

      .objbtn.on {
        background: var(--cgc-obj-btn-active-bg, var(--primary-color, #2196f3));
        color: var(--cgc-obj-icon-active-color, var(--text-primary-color, #fff));
      }

      .video-overlay {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        pointer-events: none;
        z-index: 2;
      }

      .video-overlay ha-icon {
        --mdc-icon-size: 24px;
        --ha-icon-size: 24px;
        width: 30px;
        height: 30px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        color: white;
        background: rgba(0, 0, 0, 0.30);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
      }

      .video-overlay.has-bottom-bar {
        transform: translateY(-13px);
      }

      .video-overlay.has-top-bar {
        transform: translateY(13px);
      }

      .objbtn ha-icon {
        --ha-icon-size: 22px;
        --mdc-icon-size: var(--ha-icon-size);
        width: var(--ha-icon-size);
        height: var(--ha-icon-size);
      }

      .pnav {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 10px;
        pointer-events: none;
        z-index: 3;
      }

      .pnavbtn {
        pointer-events: auto;
        width: 44px;
        height: 44px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.3);
        background: linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(0,0,0,0.28) 100%);
        backdrop-filter: blur(16px) saturate(180%);
        -webkit-backdrop-filter: blur(16px) saturate(180%);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.25);
        color: #fff;
        display: grid;
        place-items: center;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        opacity: 0.9;
      }

      .pnavbtn[disabled] {
        opacity: 0;
        cursor: default;
      }

      .pnavbtn ha-icon {
        --ha-icon-size: 26px;
        --mdc-icon-size: var(--ha-icon-size);
        width: var(--ha-icon-size);
        height: var(--ha-icon-size);
      }

      .tsbar {
        position: absolute;
        left: 0;
        right: 0;
        height: 40px;
        padding: 0 10px 0 12px;
        background: rgba(
          var(--cgc-ts-r, 0),
          var(--cgc-ts-g, 0),
          var(--cgc-ts-b, 0),
          calc(var(--barOpacity, 45) / 100)
        );
        color: var(--cgc-tsbar-txt, #fff);
        font-size: 12px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        box-sizing: border-box;
        pointer-events: none;
        z-index: 2;
        backdrop-filter: blur(calc(8px * min(1, var(--barOpacity, 45))));
        -webkit-backdrop-filter: blur(
          calc(8px * min(1, var(--barOpacity, 45)))
        );
      }

      .tsbar.top {
        top: 0;
      }

      .tsbar.bottom {
        bottom: 0;
      }

      .live-controls-bar {
        position: absolute;
        top: 8px;
        left: 8px;
        right: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        opacity: 0;
        transition: opacity 0.25s ease;
        pointer-events: none;
        z-index: 10;
      }
      .live-controls-bar.visible {
        opacity: 1;
        pointer-events: auto;
      }
      .live-controls-bar:not(.visible) .live-pill-btn {
        pointer-events: none;
      }
      .live-controls-main {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 6px;
      }
      .live-controls-main--fixed {
        justify-content: center;
      }
      .controls-bar-fixed {
        display: flex;
        flex-direction: row;
        align-items: stretch;
        padding: 0;
        margin: 0;
        gap: 6px;
        position: relative;
      }
      .controls-bar-fixed .live-controls-main--fixed,
      .controls-bar-fixed .live-pills-left,
      .controls-bar-fixed .live-pills-right {
        display: contents;
      }
      .controls-bar-fixed .gallery-pill,
      .controls-bar-fixed .live-pill-btn {
        flex: 1;
        height: 28px;
        min-width: 0;
        background: var(--cgc-obj-btn-bg, var(--cgc-ui-bg));
        border-radius: var(--cgc-obj-btn-radius, 10px);
        color: var(--cgc-txt);
        padding: 0;
        font-size: var(--cgc-pill-size, 14px);
        font-weight: 600;
      }
      .controls-bar-fixed .gallery-pill::before {
        display: none;
      }
      .controls-bar-fixed .live-pill-btn.active {
        background: var(--primary-color, #2196f3);
        border-radius: var(--cgc-obj-btn-radius, 10px);
      }
      .controls-bar-fixed .live-hamburger-wrap {
        flex: 1;
        display: flex;
      }
      .controls-bar-fixed .live-hamburger-wrap > .gallery-pill {
        flex: 1;
        width: 100%;
      }
      .live-pills-left, .live-pills-right {
        display: flex;
        flex-direction: row;
        gap: 6px;
        align-items: center;
      }
      .live-hamburger-wrap {
        position: relative;
      }
      .live-menu-backdrop {
        position: absolute;
        inset: 0;
        z-index: 22;
      }
      .live-menu-panel {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%) scale(0.88);
        opacity: 0;
        z-index: 23;
        background: rgba(0,0,0,0.72);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border-radius: 16px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 160px;
        animation: cgc-panel-in 0.2s ease-out forwards;
      }
      @keyframes cgc-panel-in {
        to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      }
      .live-menu-panel-btn {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 10px;
        background: none;
        border: none;
        cursor: pointer;
        padding: 7px 8px;
        border-radius: 10px;
        color: rgba(255,255,255,0.92);
        transition: background 0.15s ease, opacity 0.15s ease;
        -webkit-tap-highlight-color: transparent;
        width: 100%;
        text-align: left;
        opacity: 0.5;
      }
      .live-menu-panel-btn.active {
        opacity: 1;
      }
      .live-menu-panel-btn:hover {
        background: rgba(255,255,255,0.08);
        opacity: 1;
      }
      .panel-btn-icon {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        background: rgba(255,255,255,0.14);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        transition: background 0.15s ease, color 0.15s ease;
        flex-shrink: 0;
        color: rgba(255,255,255,0.7);
      }
      .live-menu-panel-btn.active .panel-btn-icon {
        background: var(--primary-color, #2196f3);
        color: #fff;
      }
      .live-menu-panel-lbl {
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        letter-spacing: 0.01em;
      }
      .gallery-pills {
        position: absolute;
        left: 8px;
        right: 8px;
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        opacity: 0;
        transition: opacity 0.25s ease;
        pointer-events: none;
        z-index: 10;
      }
      .gallery-pills-left,
      .gallery-pills-right {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 6px;
        flex: 1;
      }
      .gallery-pills-right {
        justify-content: flex-end;
      }
      .gallery-pills-center {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 6px;
      }
      .gallery-pills.visible {
        opacity: 1;
        pointer-events: auto;
      }
      .gallery-pills:not(.visible) .live-pill-btn {
        pointer-events: none;
      }
      .gallery-pills.top {
        top: 8px;
      }
      .gallery-pills.bottom {
        bottom: 8px;
      }
      .gallery-pill {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: calc(var(--cgc-pill-size, 14px) * 0.28);
        padding: calc(var(--cgc-pill-size, 14px) * 0.3) calc(var(--cgc-pill-size, 14px) * 0.65);
        color: var(--cgc-tsbar-txt, #fff);
        font-size: var(--cgc-pill-size, 14px);
        font-weight: 700;
        border-radius: 999px;
        line-height: 1;
        position: relative;
        white-space: nowrap;
      }
      .gallery-pill::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: var(--cgc-pill-bg, #000);
        opacity: calc(var(--barOpacity, 30) / 100);
        backdrop-filter: blur(4px);
        pointer-events: none;
      }
      .gallery-pill ha-icon,
      .gallery-pill span {
        position: relative;
        z-index: 1;
      }
      .gallery-pill span {
        display: flex;
        align-items: center;
        font-size: calc(var(--cgc-pill-size, 14px) - 2px);
        height: calc(var(--cgc-pill-size, 14px) + 2px);
        line-height: 1;
      }
      .gallery-pill ha-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        line-height: 0;
        --ha-icon-size: calc(var(--cgc-pill-size, 14px) + 2px);
        --mdc-icon-size: calc(var(--cgc-pill-size, 14px) + 2px);
        width: calc(var(--cgc-pill-size, 14px) + 2px);
        height: calc(var(--cgc-pill-size, 14px) + 2px);
      }
      .live-pill-btn {
        pointer-events: auto;
        border: none;
        background: transparent;
        cursor: pointer;
        padding: calc(var(--cgc-pill-size, 14px) * 0.3);
        margin: 0;
      }

      .live-pill-btn.active {
        background: rgba(255,80,80,0.85);
        border-radius: 50%;
      }

      .live-pill-btn.mic-error {
        background: rgba(255,160,0,0.85);
        border-radius: 50%;
      }


      .tsleft {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        min-width: 0;
        max-width: 60%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        pointer-events: none;
      }

      .tspill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0 12px;
        height: 22px;
        box-sizing: border-box;
        border-radius: 999px;
        background: var(--cgc-pill-bg);
        backdrop-filter: blur(6px);
        color: var(--cgc-txt);
        font-size: 11px;
        font-weight: 800;
        line-height: 1;
        white-space: nowrap;
        pointer-events: auto;
        flex-shrink: 0;
      }

      .tspill-left {
        position: absolute;
        left: 12px;
      }

      .tspill-left ha-icon {
        --ha-icon-size: 16px;
        --mdc-icon-size: 16px;
        width: 16px;
        height: 16px;
        display: block;
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: var(--topbarPad, 0px);
        margin: var(--topbarMar, 0px);
        overflow: hidden;
        min-width: 0;
      }

      .seg {
        display: inline-flex;
        align-items: center;
        height: 30px;
        background: var(--cgc-ui-bg);
        border-radius: var(--cgc-ctrl-radius, 10px);
        overflow: hidden;
        flex: 0 0 auto;
      }

      .segbtn {
        border: 0;
        height: 100%;
        padding: 0 12px;
        border-radius: 10px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--cgc-ctrl-txt, var(--cgc-txt2));
        background: transparent;
        font-size: 13px;
        font-weight: 700;
        white-space: nowrap;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .segbtn.on {
        background: var(--primary-color, #2196f3);
        color: var(--text-primary-color, #fff);
        border-radius: var(--cgc-ctrl-radius, 10px);
      }

      .datepill {
        display: flex;
        align-items: center;
        height: 30px;
        background: var(--cgc-ui-bg);
        border-radius: var(--cgc-ctrl-radius, 10px);
        overflow: hidden;
        flex: 1 1 auto;
        min-width: 0;
      }

      .dp-month-header {
        padding: 8px 18px 4px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        opacity: 0.45;
        color: var(--primary-text-color);
        border-top: 1px solid var(--divider-color, rgba(255,255,255,0.08));
      }

      .dp-month-header:first-child {
        border-top: 0;
      }

      .dp-day-label {
        flex: 1 1 auto;
        text-align: left;
        font-size: 15px;
        font-weight: 600;
      }

      .iconbtn {
        width: 44px;
        height: 44px;
        border: 0;
        background: transparent;
        color: var(--cgc-ctrl-chevron, var(--cgc-txt));
        display: grid;
        place-items: center;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        flex: 0 0 auto;
      }

      .iconbtn[disabled] {
        color: var(--cgc-txt-dis);
        cursor: default;
      }

      .dateinfo {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 10px 14px;
        color: var(--cgc-ctrl-txt, var(--cgc-txt));
        font-size: 13px;
        font-weight: 800;
      }

      .datepick {
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .dateinfo .txt {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .timeline {
        margin: 0;
        padding: 0;
        min-height: 0;
      }

      .tthumbs {
        min-width: 0;
      }

      .tthumbs.horizontal {
        display: flex;
        align-items: center;
        gap: var(--tgap, 12px);
        margin-top: 0;
        margin-bottom: 0;
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 2px;
        overscroll-behavior-x: contain;
        overscroll-behavior-y: none;
        scrollbar-width: none;
      }

      .tthumbs.horizontal::-webkit-scrollbar { display: none; }

      .tthumbs.vertical {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        align-items: start;
        gap: var(--tgap, 12px);
        margin-top: 0;
        margin-bottom: 0;
        width: 100%;
        max-height: var(--thumbsMaxHeight, 320px);
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior-y: contain;
        overscroll-behavior-x: none;
        padding-right: 2px;
        scrollbar-width: none;
      }

      .tthumbs.vertical::-webkit-scrollbar { display: none; }

      .tthumbs.vertical .tthumb {
        width: 100%;
        height: auto;
        min-width: 0;
      }

      .tthumbs.vertical .timg,
      .tthumbs.vertical .tph {
        width: 100%;
        height: 100%;
        aspect-ratio: 1 / 1;
      }

      .tthumb:focus {
        outline: none;
      }

      .tthumb {
        border: 0;
        padding: 0;
        overflow: hidden;
        background: var(--cgc-thumb-bg);
        outline: none;
        cursor: pointer;
        position: relative;
        flex: 0 0 auto;
        scroll-snap-align: start;
        -webkit-touch-callout: none;
        user-select: none;

        opacity: 0.3;
        transform: scale(0.94);
        transition:
          transform 0.1s ease,
          opacity 0.12s ease,
          box-shadow 0.14s ease;
      }

      .tthumb.on {
        opacity: 1;
        transform: scale(1);
        z-index: 2;
      }

      .tthumb:active {
        transform: scale(0.97);
      }

      .tthumb.on:active {
        transform: scale(0.985);
      }

      .tthumb::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        box-sizing: border-box;
      }

      .tthumb.sel::after {
        border: 2px solid var(--primary-color, #2196f3);
      }

      .timg {
        width: 100%;
        height: 100%;
        object-fit: var(--cgc-object-fit, cover);
        display: block;
      }

      .tph {
        width: 100%;
        height: 100%;
        background: var(--cgc-thumb-bg);
      }

      .tbar {
        position: absolute;
        left: 0;
        right: 0;
        height: 26px;
        padding: 0 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: var(--cgc-tbar-bg);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        font-size: 11px;
        font-weight: 800;
        color: var(--cgc-tbar-txt, var(--cgc-txt));
        pointer-events: none;
        z-index: 2;
      }

      .tbar.bottom {
        bottom: 0;
        border-radius: 0 0 var(--cgc-thumb-radius, 10px) var(--cgc-thumb-radius, 10px);
      }

      .tbar.top {
        top: 0;
        border-radius: var(--cgc-thumb-radius, 10px) var(--cgc-thumb-radius, 10px) 0 0;
      }

      .tbar.hidden {
        display: none;
      }

      .tbar-left {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .tbar-icon {
        --ha-icon-size: 16px;
        --mdc-icon-size: var(--ha-icon-size);
        width: var(--ha-icon-size);
        height: var(--ha-icon-size);
        flex: 0 0 auto;
      }

      .selOverlay {
        position: absolute;
        inset: 0;
        background: var(--cgc-sel-ov-a);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: 0.12s ease;
        pointer-events: none;
      }

      .selOverlay.on {
        opacity: 1;
        background: var(--cgc-sel-ov-b);
      }

      .selOverlay ha-icon {
        color: var(--cgc-txt);
        --mdc-icon-size: 22px;
        --ha-icon-size: 22px;
        width: 22px;
        height: 22px;
      }

      .bulkbar {
        margin: 0;
        padding: 8px 10px;
        height: 28px;
        border-radius: 12px;

        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;

        background: var(--cgc-bulk-bg);
        border: 1px solid var(--cgc-bulk-border);

        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);

        position: relative;
        z-index: 2;
      }

      .bulkbar-left {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1 1 auto;
      }

      .bulkbar-text {
        font-size: 14px;
        font-weight: 700;
        color: var(--cgc-txt);
        white-space: nowrap;
      }

      .bulkactions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .bulkaction {
        height: 34px;
        padding: 0 12px;

        border-radius: 12px;
        border: 1px solid var(--cgc-ui-stroke);

        display: inline-flex;
        align-items: center;
        gap: 6px;

        font-size: 13px;
        font-weight: 700;

        cursor: pointer;

        background: var(--cgc-ui-bg);
        color: var(--cgc-txt);
      }

      .bulkaction ha-icon {
        --ha-icon-size: 16px;
        --mdc-icon-size: var(--ha-icon-size);
      }

      .bulkaction[disabled] {
        opacity: 0.45;
        cursor: default;
      }

      .bulkcancel {
        background: var(--cgc-ui-bg);
      }

      .bulkdelete {
        background: color-mix(in srgb, var(--error-color, #c62828) 18%, transparent);
        border: 1px solid color-mix(in srgb, var(--error-color, #c62828) 35%, transparent);
      }

      @media (max-width: 700px) {
        .bulkbar {
          padding: 10px 12px;
          border-radius: 20px;
          gap: 12px;
          min-height: 64px;
        }

        .bulkbar-check {
          width: 48px;
          height: 48px;
          border-radius: 14px;
        }

        .bulkbar-check ha-icon {
          --ha-icon-size: 26px;
        }

        .bulkbar-text {
          font-size: 15px;
        }

        .bulkactions {
          gap: 10px;
        }

        .bulkaction {
          height: 48px;
          padding: 0 16px;
          border-radius: 16px;
          font-size: 15px;
          gap: 10px;
        }

        .bulkaction ha-icon {
          --ha-icon-size: 20px;
        }
      }

      .bulk-floating-hint {
        position: absolute;
        left: 50%;
        top: 58px;
        transform: translateX(-50%);
        padding: 10px 16px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.76);
        color: #fff;
        font-size: 13px;
        font-weight: 800;
        white-space: nowrap;
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.24);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        z-index: 30;
        pointer-events: none;
        animation: bulkHintFade 5s ease forwards;
      }

      @keyframes bulkHintFade {
        0% {
          opacity: 0;
          transform: translate(-50%, -6px);
        }
        8% {
          opacity: 1;
          transform: translate(-50%, 0);
        }
        90% {
          opacity: 1;
          transform: translate(-50%, 0);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -6px);
        }
      }

      .empty {
        padding: 12px;
        border-radius: 14px;
        background: var(--cgc-ui-bg);
        color: var(--cgc-txt);
      }

      .empty.inpreview {
        position: absolute;
        inset: 50% auto auto 50%;
        transform: translate(-50%, -50%);
        z-index: 3;
      }

      .filter-empty {
        text-align: center;
      }

      .thumb-menu-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9998;
        background: rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(3px);
        -webkit-backdrop-filter: blur(3px);
      }

      .thumb-menu-sheet {
        position: fixed;
        left: 50%;
        bottom: 14px;
        transform: translateX(-50%);
        width: min(94vw, 420px);
        border-radius: 24px;
        overflow: hidden;
        z-index: 9999;
        background: var(--card-background-color, rgba(24,24,28,0.96));
        color: var(--primary-text-color);
        border: 1px solid var(--divider-color, rgba(255,255,255,0.1));
        box-shadow: 0 22px 48px rgba(0, 0, 0, 0.34);
      }

      .thumb-menu-handle {
        width: 42px;
        height: 5px;
        border-radius: 999px;
        background: var(--cgc-ui-stroke);
        margin: 10px auto 6px;
      }

      .thumb-menu-head {
        padding: 8px 18px 12px;
        text-align: center;
      }

      .thumb-menu-subtitle {
        margin-top: 6px;
        font-size: 12px;
        font-weight: 700;
        color: var(--cgc-txt2);
      }

      .thumb-menu-list {
        display: flex;
        flex-direction: column;
        padding: 0 8px 8px;
      }

      .thumb-menu-item {
        width: 100%;
        border: 0;
        background: transparent;
        color: var(--primary-text-color);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 14px;
        border-radius: 16px;
        cursor: pointer;
        text-align: left;
      }

      .thumb-menu-item:hover {
        background: var(--cgc-ui-bg);
      }

      .thumb-menu-item.danger {
        color: var(--error-color, #ff8a80);
      }

      .thumb-menu-item-left {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }

      .thumb-menu-item-left ha-icon {
        --ha-icon-size: 20px;
        --mdc-icon-size: var(--ha-icon-size);
        width: var(--ha-icon-size);
        height: var(--ha-icon-size);
        flex: 0 0 auto;
      }

      .thumb-menu-item-left span {
        font-size: 15px;
        font-weight: 800;
      }

      .thumb-menu-item-arrow {
        --ha-icon-size: 18px;
        --mdc-icon-size: var(--ha-icon-size);
        width: var(--ha-icon-size);
        height: var(--ha-icon-size);
        color: var(--cgc-txt-dis);
        flex: 0 0 auto;
      }

      .thumb-menu-footer {
        padding: 0 12px 12px;
      }

      .tsbar-live-center {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .tsbar-cam-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        color: var(--cgc-tsbar-txt, #fff);
        cursor: pointer;
        pointer-events: auto;
        padding: 0;
        height: 28px;
        width: 28px;
      }

      .tsbar-cam-btn ha-icon {
        --ha-icon-size: 22px;
        --mdc-icon-size: 22px;
        width: 22px;
        height: 22px;
        display: block;
      }

      .tsbar-back-btn {
        cursor: pointer;
        border: none;
      }

      .tsbar-back-btn ha-icon {
        --ha-icon-size: 16px;
        --mdc-icon-size: 16px;
        width: 16px;
        height: 16px;
        display: block;
      }

      .thumb-menu-cancel {
        width: 100%;
        border: 0;
        border-radius: 16px;
        padding: 15px 16px;
        cursor: pointer;
        background: var(--cgc-ui-bg);
        color: var(--primary-text-color);
        font-size: 15px;
        font-weight: 900;
      }

      @media (max-width: 420px) {
        .topbar {
          gap: 6px;
        }


        .datepill.has-filters .dateinfo {
          font-size: 11px;
          padding: 0 10px;
        }

        .segbtn {
          padding: 9px 12px;
        }

        .iconbtn {
          width: 40px;
          height: 40px;
        }

        .dateinfo {
          padding: 9px 12px;
        }

        .objfilters {
          gap: 6px;
        }

        .objbtn {
          border-radius: 6px;
        }

        .objbtn ha-icon {
          --ha-icon-size: 20px;
        }

        .live-picker {
          width: min(92%, 440px);
          border-radius: 18px;
        }

        .live-picker-title {
          font-size: 15px;
        }

        .live-picker-item {
          padding: 14px 16px;
        }


        .bulk-floating-hint {
          top: 50%;
          max-width: calc(100% - 24px);
          font-size: 12px;
          padding: 9px 14px;
        }

        .thumb-menu-sheet {
          width: min(96vw, 420px);
          bottom: 10px;
          border-radius: 22px;
        }

        .tthumbs.vertical {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
    `}}ve.prototype.getCardSize=function(){return 6},ve.prototype.getLayoutOptions=function(){return{grid_columns:4,grid_min_columns:2}},customElements.define("camera-gallery-card",ve),window.customCards=window.customCards||[],window.customCards.push({type:"camera-gallery-card",name:"Camera Gallery Card",description:"Media gallery for Home Assistant (sensor fileList OR media_source folder) with optional live preview",preview:!0}),console.info("Camera Gallery Card v2.7.0");const be={"mdi:close":"M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z","mdi:arrow-left":"M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z","mdi:check":"M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z","mdi:folder-outline":"M20,18H4V8H20M20,6H12L10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6Z","mdi:folder-search-outline":"M11.5,13C12.04,13 12.55,13.17 12.97,13.46L16.43,9.1C15.55,8.44 14.82,7.62 14.27,6.67L10.5,6.5L8.5,4.5H4.5C3.4,4.5 2.5,5.4 2.5,6.5V18.5A2,2 0 0,0 4.5,20.5H15.73C15.27,19.88 15,19.1 15,18.25C15,16.18 16.68,14.5 18.75,14.5C20.82,14.5 22.5,16.18 22.5,18.25C22.5,20.32 20.82,22 18.75,22C17.6,22 16.56,21.5 15.83,20.68L12.38,17.22C12.1,17.39 11.81,17.5 11.5,17.5C10.12,17.5 9,16.38 9,15C9,13.62 10.12,12.5 11.5,12.5L11.5,13Z","mdi:delete-outline":"M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19M8,9H16V19H8V9M15.5,4L14.5,3H9.5L8.5,4H5V6H19V4H15.5Z","mdi:chevron-right":"M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z","mdi:chevron-down":"M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z","mdi:information-outline":"M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z","mdi:help-circle-outline":"M11,18H13V16H11V18M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,6A4,4 0 0,0 8,10H10A2,2 0 0,1 12,8A2,2 0 0,1 14,10C14,12 11,11.75 11,15H13C13,12.75 16,12.5 16,10A4,4 0 0,0 12,6Z","mdi:alert-outline":"M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z","mdi:plus":"M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z","mdi:backup-restore":"M12,4C14.1,4 16.1,4.8 17.6,6.3C20.7,9.4 20.7,14.5 17.6,17.6C15.8,19.5 13.3,20.2 10.9,19.9L11.4,17.9C13.1,18.1 14.9,17.5 16.2,16.2C18.5,13.9 18.5,10.1 16.2,7.7C15.1,6.6 13.5,6 12,6V10.6L7,5.6L12,0.6V4M6.3,17.6C3.7,15 3.3,11 5.1,7.9L6.6,9.4C5.5,11.6 5.9,14.4 7.8,16.2C8.6,17 9.5,17.5 10.5,17.8L10,19.8C8.5,19.4 7.3,18.6 6.3,17.6Z","mdi:cog-outline":"M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.68 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z","mdi:image-outline":"M19,19H5V5H19M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M13.96,12.29L11.21,15.83L9.25,13.47L6.5,17H17.5L13.96,12.29Z","mdi:video-outline":"M15,8V16H5V8H15M16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5V7A1,1 0 0,0 16,6Z","mdi:view-grid-outline":"M3,3V11H11V3H3M9,9H5V5H9V9M3,13V21H11V13H3M9,19H5V15H9V19M13,3V11H21V3H13M19,9H15V5H19V9M13,13V21H21V13H13M19,19H15V15H19V19Z","mdi:palette-outline":"M12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2C17.5,2 22,6 22,11A6,6 0 0,1 16,17H14.2C13.9,17 13.7,17.2 13.7,17.5C13.7,17.6 13.8,17.7 13.8,17.8C14.2,18.3 14.4,18.9 14.4,19.5C14.5,20.9 13.4,22 12,22M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C12.3,20 12.5,19.8 12.5,19.5C12.5,19.3 12.4,19.2 12.4,19.1C12,18.6 11.8,18.1 11.8,17.5C11.8,16.1 12.9,15 14.3,15H16A4,4 0 0,0 20,11C20,7.1 16.4,4 12,4M6.5,10A1.5,1.5 0 0,0 5,11.5A1.5,1.5 0 0,0 6.5,13A1.5,1.5 0 0,0 8,11.5A1.5,1.5 0 0,0 6.5,10M9.5,6.5A1.5,1.5 0 0,0 8,8A1.5,1.5 0 0,0 9.5,9.5A1.5,1.5 0 0,0 11,8A1.5,1.5 0 0,0 9.5,6.5M14.5,6.5A1.5,1.5 0 0,0 13,8A1.5,1.5 0 0,0 14.5,9.5A1.5,1.5 0 0,0 16,8A1.5,1.5 0 0,0 14.5,6.5M17.5,10A1.5,1.5 0 0,0 16,11.5A1.5,1.5 0 0,0 17.5,13A1.5,1.5 0 0,0 19,11.5A1.5,1.5 0 0,0 17.5,10Z","mdi:card-outline":"M20,8H4V6H20M20,18H4V12H20M20,4H4C2.9,4 2,4.9 2,6V18C2,19.1 2.9,20 4,20H20C21.1,20 22,19.1 22,18V6C22,4.9 21.1,4 20,4Z","mdi:filter-outline":"M15,19.88C15.04,20.18 14.94,20.5 14.71,20.71C14.32,21.1 13.69,21.1 13.3,20.71L9.29,16.7C9.06,16.47 8.96,16.16 9,15.87V10.75L4.21,4.62C3.87,4.19 3.95,3.56 4.38,3.22C4.57,3.08 4.78,3 5,3V3H19V3C19.22,3 19.43,3.08 19.62,3.22C20.05,3.56 20.13,4.19 19.79,4.62L15,10.75V19.88M7.04,5L11,10.06V15.58L13,17.58V10.05L16.96,5H7.04Z","mdi:calendar-outline":"M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,13H12V18H17V13Z","mdi:account":"M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z","mdi:car":"M18.92,6C18.72,5.42 18.16,5 17.5,5H6.5C5.84,5 5.28,5.42 5.08,6L3,12V20A1,1 0 0,0 4,21H5A1,1 0 0,0 6,20V19H18V20A1,1 0 0,0 19,21H20A1,1 0 0,0 21,20V12L18.92,6M6.5,16A1.5,1.5 0 0,1 5,14.5A1.5,1.5 0 0,1 6.5,13A1.5,1.5 0 0,1 8,14.5A1.5,1.5 0 0,1 6.5,16M17.5,16A1.5,1.5 0 0,1 16,14.5A1.5,1.5 0 0,1 17.5,13A1.5,1.5 0 0,1 19,14.5A1.5,1.5 0 0,1 17.5,16M5,11L6.5,6.5H17.5L19,11H5Z","mdi:bicycle":"M5,20.5A3.5,3.5 0 0,1 1.5,17A3.5,3.5 0 0,1 5,13.5A3.5,3.5 0 0,1 8.5,17A3.5,3.5 0 0,1 5,20.5M5,12A5,5 0 0,0 0,17A5,5 0 0,0 5,22A5,5 0 0,0 10,17A5,5 0 0,0 5,12M14.8,10H19V8.2H15.8L13.86,4.93C13.57,4.43 13,4.1 12.4,4.1C11.93,4.1 11.5,4.29 11.2,4.6L7.5,8.29C7.19,8.6 7,9 7,9.5C7,10.13 7.33,10.66 7.85,10.97L11.2,13V18H13V11.5L10.75,10.15L13.07,7.85M19,20.5A3.5,3.5 0 0,1 15.5,17A3.5,3.5 0 0,1 19,13.5A3.5,3.5 0 0,1 22.5,17A3.5,3.5 0 0,1 19,20.5M19,12A5,5 0 0,0 14,17A5,5 0 0,0 19,22A5,5 0 0,0 24,17A5,5 0 0,0 19,12M16,4.8C17,4.8 17.8,4 17.8,3C17.8,2 17,1.2 16,1.2C15,1.2 14.2,2 14.2,3C14.2,4 15,4.8 16,4.8Z","mdi:bird":"M12.07,2.29C12.07,2.29 6,2 6,8C6,8 5.54,9.69 7,10.5V11.5L5,13L6,14L8,13.5V14.5L6,16V17L8,17.5V22H9V17.5L11.92,16.18V22H13V16L15,17V22H16V16.5L16.5,16V11C16.5,11 18.5,10.5 18.5,8C18.5,5.5 16.72,4.29 16,4C15,3.5 14.5,3 12.07,2.29M12,4C12,4 14,4 15,5C15,5 13,5 12,4Z","mdi:bus":"M18,11H6V6H18M16.5,17A1.5,1.5 0 0,1 15,15.5A1.5,1.5 0 0,1 16.5,14A1.5,1.5 0 0,1 18,15.5A1.5,1.5 0 0,1 16.5,17M7.5,17A1.5,1.5 0 0,1 6,15.5A1.5,1.5 0 0,1 7.5,14A1.5,1.5 0 0,1 9,15.5A1.5,1.5 0 0,1 7.5,17M4,16C4,16.88 4.39,17.67 5,18.22V20A1,1 0 0,0 6,21H7A1,1 0 0,0 8,20V19H16V20A1,1 0 0,0 17,21H18A1,1 0 0,0 19,20V18.22C19.61,17.67 20,16.88 20,16V6C20,2.5 16.42,2 12,2C7.58,2 4,2.5 4,6V16Z","mdi:cat":"M12,8L10.67,8.09C9.81,7.07 7.4,4.5 5,4.5C5,4.5 3.03,7.46 4.96,9.75C4.87,10.5 4.84,11.25 4.84,12C4.84,17.05 7.88,20 12,20C16.12,20 19.16,17.05 19.16,12C19.16,11.25 19.13,10.5 19.04,9.75C20.97,7.46 19,4.5 19,4.5C16.6,4.5 14.19,7.07 13.33,8.09L12,8M9,11A1,1 0 0,1 10,12A1,1 0 0,1 9,13A1,1 0 0,1 8,12A1,1 0 0,1 9,11M15,11A1,1 0 0,1 16,12A1,1 0 0,1 15,13A1,1 0 0,1 14,12A1,1 0 0,1 15,11M11,14H13L12.3,15.39C12.5,16.03 13.06,16.5 13.75,16.5A1.25,1.25 0 0,0 15,15.25V15H16V15.25A2.25,2.25 0 0,1 13.75,17.5C13,17.5 12.35,17.15 11.92,16.6L11,14Z","mdi:dog":"M4.5,9.5A0.5,0.5 0 0,1 4,9A0.5,0.5 0 0,1 4.5,8.5A0.5,0.5 0 0,1 5,9A0.5,0.5 0 0,1 4.5,9.5M6,3C4.89,3 4,3.89 4,5V9.5A2.5,2.5 0 0,0 6.5,12A2.5,2.5 0 0,0 9,9.5V5A2,2 0 0,1 11,3H6M18.5,9.5A0.5,0.5 0 0,1 18,9A0.5,0.5 0 0,1 18.5,8.5A0.5,0.5 0 0,1 19,9A0.5,0.5 0 0,1 18.5,9.5M18,3H14C15.1,3 16,3.89 16,5V9.5A2.5,2.5 0 0,1 13.5,12A2.5,2.5 0 0,1 11,9.5V9H9V9.5A2.5,2.5 0 0,1 6.5,12H6.5A2.5,2.5 0 0,1 5.42,11.79L3,14.21V21H9V16.72C9.75,17.24 10.84,17.5 12,17.5C13.16,17.5 14.25,17.24 15,16.72V21H21V14.21L18.58,11.79A2.5,2.5 0 0,1 17.5,12A2.5,2.5 0 0,1 15,9.5V5A2,2 0 0,1 17,3H18C19.1,3 20,3.89 20,5V9C20,9 20.07,9.27 20.35,9.41L21,9.69V5C21,3.89 20.1,3 19,3H18Z","mdi:motorbike":"M5,11.5A0.5,0.5 0 0,1 5.5,12A0.5,0.5 0 0,1 5,12.5A0.5,0.5 0 0,1 4.5,12A0.5,0.5 0 0,1 5,11.5M19,11.5A0.5,0.5 0 0,1 19.5,12A0.5,0.5 0 0,1 19,12.5A0.5,0.5 0 0,1 18.5,12A0.5,0.5 0 0,1 19,11.5M19,9.5A2.5,2.5 0 0,0 16.5,12A2.5,2.5 0 0,0 19,14.5A2.5,2.5 0 0,0 21.5,12A2.5,2.5 0 0,0 19,9.5M5,9.5A2.5,2.5 0 0,0 2.5,12A2.5,2.5 0 0,0 5,14.5A2.5,2.5 0 0,0 7.5,12A2.5,2.5 0 0,0 5,9.5M19,8C20.61,8 22,8.88 22.73,10.19L21.31,10.89C20.83,10.35 20.16,10 19.39,10L19,10C19,10 18,8 17,8L14,8L11.78,8.7L13.04,10H15.54L13.81,12.72L12.08,10.55L10.3,10L9.63,8.12C9.12,7.47 8.36,7 7.5,7C6,7 4.77,8.06 4.55,9.5H3.03C3.27,7.24 5.17,5.5 7.5,5.5C9.21,5.5 10.67,6.5 11.37,8H13L10,5H17C18.1,5 19,5.9 19,7V8M5,8C3.39,8 2,8.88 1.27,10.19L2.69,10.89C3.17,10.35 3.84,10 4.61,10L5,10C5,10 6,8 7,8H5Z","mdi:truck":"M18,18.5A1.5,1.5 0 0,1 16.5,17A1.5,1.5 0 0,1 18,15.5A1.5,1.5 0 0,1 19.5,17A1.5,1.5 0 0,1 18,18.5M19.5,9.5L21.46,12H17V9.5M6.5,18.5A1.5,1.5 0 0,1 5,17A1.5,1.5 0 0,1 6.5,15.5A1.5,1.5 0 0,1 8,17A1.5,1.5 0 0,1 6.5,18.5M20,8H17V4H3C1.89,4 1,4.89 1,6V17H3A3,3 0 0,0 6,20A3,3 0 0,0 9,17H15A3,3 0 0,0 18,20A3,3 0 0,0 21,17H23V12L20,8Z","mdi:doorbell-video":"M6,2A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V4A2,2 0 0,0 18,2H6M12,5A3,3 0 0,1 15,8A3,3 0 0,1 12,11A3,3 0 0,1 9,8A3,3 0 0,1 12,5M7,14H9V19H7V14M9,14H15V19H9V14M15,14H17V19H15V14Z","mdi:shape":"M11,13.5V21.5H3V13.5H11M12,2L17.5,11H6.5L12,2M17.5,13C20,13 22,15 22,17.5C22,20 20,22 17.5,22C15,22 13,20 13,17.5C13,15 15,13 17.5,13Z"};function fe(e,t=18){return`<svg class="cgc-svg-icon" viewBox="0 0 24 24" width="${t}" height="${t}" aria-hidden="true" style="fill:currentColor;flex-shrink:0;display:block"><path d="${be[e]||""}"/></svg>`}const ye=[{id:"card",label:"Card",icon:"mdi:card-outline",controls:[{type:"color",hostId:"bgcolor-host",variable:"--cgc-card-bg",label:"Background"},{type:"color",hostId:"bordercolor-host",variable:"--cgc-card-border-color",label:"Border color"},{type:"radius",variable:"--r",label:"Border radius",min:0,max:32,default:10}]},{id:"preview",label:"Pills",icon:"mdi:image-outline",controls:[{type:"color",hostId:"tsbar-txt-host",variable:"--cgc-tsbar-txt",label:"Text / icon color"},{type:"color",hostId:"pill-bg-host",variable:"--cgc-pill-bg",label:"Background color"},{type:"radius",variable:"--cgc-pill-size",label:"Size",min:10,max:28,default:14}]},{id:"thumbs",label:"Thumbnails",icon:"mdi:view-grid-outline",controls:[{type:"color",hostId:"tbarbg-host",variable:"--cgc-tbar-bg",label:"Bar background"},{type:"color",hostId:"tbar-txt-host",variable:"--cgc-tbar-txt",label:"Bar text color"},{type:"radius",variable:"--cgc-thumb-radius",label:"Border radius",min:0,max:20,default:10}]},{id:"filters",label:"Filter buttons",icon:"mdi:filter-outline",controls:[{type:"color",hostId:"filterbg-host",variable:"--cgc-obj-btn-bg",label:"Background"},{type:"color",hostId:"iconcolor-host",variable:"--cgc-obj-icon-color",label:"Icon color"},{type:"color",hostId:"btnactive-host",variable:"--cgc-obj-btn-active-bg",label:"Active background"},{type:"color",hostId:"iconactive-host",variable:"--cgc-obj-icon-active-color",label:"Active icon color"},{type:"radius",variable:"--cgc-obj-btn-radius",label:"Border radius",min:0,max:14,default:10}]},{id:"controls",label:"Today / Date / Live",icon:"mdi:calendar-outline",controls:[{type:"color",hostId:"ctrl-txt-host",variable:"--cgc-ctrl-txt",label:"Text color"},{type:"color",hostId:"ctrl-chevron-host",variable:"--cgc-ctrl-chevron",label:"Chevron color"},{type:"color",hostId:"live-active-host",variable:"--cgc-live-active-bg",label:"Live active color"},{type:"radius",variable:"--cgc-ctrl-radius",label:"Border radius",min:0,max:16,default:10}]}];class we extends HTMLElement{constructor(){super(),this._config={},this.attachShadow({mode:"open"}),this._scrollRestore={windowY:0,hostScrollTop:0,browserBodyTop:0},this._activeTab="general",this._focusState=null,this._lastSuggestFingerprint={entities:"",mediasources:""},this._mediaBrowseCache=new Map,this._mediaSuggestReq=0,this._mediaSuggestTimer=null,this._raf=null,this._mediaBrowserOpen=!1,this._mediaBrowserLoading=!1,this._mediaBrowserPath="",this._mediaBrowserItems=[],this._mediaBrowserHistory=[],this._suggestState={entities:{open:!1,items:[],index:-1},mediasources:{open:!1,items:[],index:-1}},this._openStyleSections=new Set,this._wizardOpen=!1,this._wizardFolder="",this._wizardName="",this._wizardStatus=null,this._editorRendered=!1}_applyFieldValidation(e){const t=this.shadowRoot?.getElementById(e);if(!t)return;const i=t.closest(".field");if(!i)return;i.classList.remove("valid","invalid");let n="neutral";"entities"===e&&(n=this._validateSensors(t.value)),"mediasources"===e&&(n=this._validateMediaFolders(t.value)),"valid"===n&&i.classList.add("valid"),"invalid"===n&&i.classList.add("invalid")}_applySuggestion(e,t){const i=this.shadowRoot?.getElementById(e);i&&(this._replaceCurrentLine(i,t),"entities"===e?(this._commitEntities(!1),this._applyFieldValidation("entities")):"mediasources"===e&&(this._commitMediaSources(!1),this._applyFieldValidation("mediasources")),this._closeSuggestions(e))}_acceptSuggestion(e){const t=this._suggestState[e];if(!t?.open||!t.items.length)return!1;const i=t.index>=0?t.index:0,n=t.items[i];return this._applySuggestion(e,n),!0}async _browseMediaFolders(e){const t=this._normalizeMediaSourceValue(e);if(!t||!this._hass?.callWS)return[];if(this._mediaBrowseCache.has(t))return this._mediaBrowseCache.get(t);try{const e=await this._hass.callWS({type:"media_source/browse_media",media_content_id:t}),i=(Array.isArray(e?.children)?e.children:[]).filter(e=>this._isFolderNode(e)).map(e=>String(e.media_content_id||"").trim()).filter(e=>e.startsWith("media-source://")),n=this._sortUniqueStrings(i);return this._mediaBrowseCache.set(t,n),n}catch(e){return this._mediaBrowseCache.set(t,[]),[]}}async _browseMediaFolderNodes(e){const t=null===e||""===e||null==e,i=t?null:this._normalizeMediaSourceValue(e);if(!t&&null==i)return[];if(!this._hass?.callWS)return[];const n=`__nodes__:${t?"__root__":i}`;if(this._mediaBrowseCache.has(n))return this._mediaBrowseCache.get(n);try{const e={type:"media_source/browse_media"};t||(e.media_content_id=i);const s=await this._hass.callWS(e),r=(Array.isArray(s?.children)?s.children:[]).filter(e=>this._isFolderNode(e)).map(e=>{const t=String(e.media_content_id||"").trim();return{id:t,title:String(e.title||"").trim()||this._lastPathSegment(t)}}).filter(e=>e.id.startsWith("media-source://")).sort((e,t)=>e.title.localeCompare(t.title));return this._mediaBrowseCache.set(n,r),r}catch(e){return this._mediaBrowseCache.set(n,[]),[]}}_getHostScroller(){let e=this;for(;e;){const t=e.getRootNode?.(),i=e.parentElement||(t&&t.host?t.host:null);if(!i)break;try{const e=getComputedStyle(i).overflowY;if(("auto"===e||"scroll"===e)&&i.scrollHeight>i.clientHeight)return i}catch(e){}e=i}return null}_captureScrollState(){try{this._scrollRestore.windowY=window.scrollY||window.pageYOffset||document.documentElement.scrollTop||0}catch(e){this._scrollRestore.windowY=0}try{const e=this._getHostScroller();this._scrollRestore.hostScrollTop=e?e.scrollTop:0}catch(e){this._scrollRestore.hostScrollTop=0}try{const e=this.shadowRoot?.querySelector(".browser-body");this._scrollRestore.browserBodyTop=e?e.scrollTop:0}catch(e){this._scrollRestore.browserBodyTop=0}}_restoreScrollState(){requestAnimationFrame(()=>{try{const e=this._getHostScroller();e?e.scrollTop=this._scrollRestore.hostScrollTop||0:window.scrollTo({top:this._scrollRestore.windowY||0,behavior:"auto"})}catch(e){}try{const e=this.shadowRoot?.querySelector(".browser-body");e&&(e.scrollTop=this._scrollRestore.browserBodyTop||0)}catch(e){}})}_lockPageScroll(){this._captureScrollState();const e=document.body,t=document.documentElement;e&&(e.style.overflow="hidden",e.style.touchAction="none"),t&&(t.style.overflow="hidden")}_unlockPageScroll(){const e=document.body,t=document.documentElement;e&&(e.style.overflow="",e.style.touchAction=""),t&&(t.style.overflow=""),this._restoreScrollState()}_clampInt(e,t,i){return Number.isFinite(e)?Math.min(i,Math.max(t,Math.round(e))):t}_closeSuggestions(e){this._suggestState[e]={open:!1,items:[],index:-1},this._lastSuggestFingerprint[e]="",this._renderSuggestions(e)}_collectEntitySuggestions(){return this._hass?Object.values(this._hass.states).filter(e=>e.entity_id.startsWith("sensor.")&&void 0!==e.attributes?.fileList).map(e=>e.entity_id).sort((e,t)=>e.localeCompare(t)):[]}async _collectMediaSuggestionsDynamic(e){const t=this._getDefaultMediaSuggestions(),i=this._normalizeMediaSourceValue(e);if(!i)return t.slice(0,8);if(!i.startsWith("media-source://"))return t.filter(e=>e.toLowerCase().includes(i.toLowerCase())).slice(0,8);const n=await this._browseMediaFolders(i);if(n.length)return n.slice(0,8);const{base:s,needle:r}=this._mediaBaseAndNeedle(i);if(!s)return t.filter(e=>e.toLowerCase().includes(i.toLowerCase())).slice(0,8);const o=await this._browseMediaFolders(s);if(!o.length)return t.filter(e=>e.toLowerCase().includes(i.toLowerCase())).slice(0,8);const a=r?o.filter(e=>e.slice(s.length+1).toLowerCase().includes(r.toLowerCase())):o;return a.slice(0,8)}_commitEntities(e=!1){const t=this.shadowRoot?.getElementById("entities"),i=String(t?.value||""),n=this._parseTextList(i);if(!n.length){const t={...this._config};return delete t.entities,delete t.entity,this._config=this._stripAlwaysTrueKeys(t),void(e&&(this._fire(),this._scheduleRender()))}const s={...this._config,entities:n};delete s.entity,this._config=this._stripAlwaysTrueKeys(s),e&&(this._fire(),this._scheduleRender())}_commitMediaSources(e=!1){const t=this.shadowRoot?.getElementById("mediasources"),i=String(t?.value||""),n=this._parseTextList(i);if(!n.length){const t={...this._config};return delete t.media_source,delete t.media_sources,this._config=this._stripAlwaysTrueKeys(t),void(e&&(this._fire(),this._scheduleRender()))}const s={...this._config,media_sources:n};delete s.media_source,this._config=this._stripAlwaysTrueKeys(s),e&&(this._fire(),this._scheduleRender())}_filterSuggestions(e,t){const i=String(t||"").trim().toLowerCase();return i?e.filter(e=>String(e).toLowerCase().includes(i)).slice(0,8):e.slice(0,8)}_fire(){this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:{...this._config}},bubbles:!0,composed:!0}))}_getDefaultMediaSuggestions(){const e=Array.isArray(this._config.media_sources)?this._config.media_sources.map(String).map(e=>e.trim()).filter(Boolean):[],t=new Set(["media-source://frigate","media-source://frigate/frigate/event-search/clips","media-source://frigate/frigate/event-search/snapshots","media-source://media_source","media-source://media_source/local","media-source://media_source/local/mac_share",...e]);return Array.from(t).sort((e,t)=>e.localeCompare(t))}_getMediaBrowserRoots(){const e=Array.isArray(this._config.media_sources)?this._config.media_sources.map(e=>this._normalizeMediaSourceValue(e)).filter(Boolean):[];return this._sortUniqueStrings(["media-source://frigate","media-source://media_source","media-source://media_source/local",...e])}_getTextareaLineInfo(e){const t=String(e?.value||""),i="number"==typeof e.selectionStart?e.selectionStart:t.length,n=t.slice(0,i),s=t.slice(i),r=n.lastIndexOf("\n")+1,o=s.indexOf("\n"),a=-1===o?t.length:i+o,l=t.slice(r,a);return{value:t,caret:i,lineStart:r,lineEnd:a,line:l,lineCaret:i-r}}_isFolderNode(e){const t=String(e?.media_class||"").toLowerCase(),i=String(e?.media_content_type||"").toLowerCase(),n=String(e?.media_content_id||"");return"app"===t||"channel"===t||"directory"===t||("directory"===i||!(!n.startsWith("media-source://")||/\.[a-z0-9]{2,6}$/i.test(n)))}_looksLikeFile(e){const t=String(e||"");if(t.startsWith("media-source://"))return!1;const i=t.split("/").pop()||"";return/\.(jpg|jpeg|png|gif|webp|mp4|mov|mkv|avi|m4v|wav|mp3|aac|flac|pdf|txt|json)$/i.test(i)}_lastPathSegment(e){const t=String(e||"").replace(/\/+$/,"");if(!t)return"";const i=t.split("/");return i[i.length-1]||t}_mediaBaseAndNeedle(e){const t=this._normalizeMediaSourceValue(e);if(!t.startsWith("media-source://"))return{base:"",needle:t};const i=t.lastIndexOf("/");if(i<=14)return{base:t,needle:""};const n=t.slice(i+1),s=t.slice(0,i);return n?{base:s,needle:n}:{base:s,needle:""}}_moveSuggestion(e,t){const i=this._suggestState[e];if(!i?.open||!i.items.length)return;let n=i.index+t;n<0&&(n=i.items.length-1),n>=i.items.length&&(n=0),this._suggestState[e]={...i,index:n},this._renderSuggestions(e)}_normalizeMediaSourceValue(e){let t=String(e||"").trim();return t?(t=t.replace(/\s+/g,""),t=t.replace(/\/{2,}$/g,""),t):""}_normalizeObjectFilters(e){const t=Array.isArray(e)?e:e?[e]:[],i=[],n=new Set;for(const e of t){let t="";"string"==typeof e?t=e.toLowerCase().trim():"object"==typeof e&&null!==e&&(t=Object.keys(e)[0].toLowerCase().trim()),t&&!n.has(t)&&(n.add(t),i.push(e))}return i}_numInt(e,t){const i=Number(e);return Number.isFinite(i)?Math.round(i):t}_objectIcon(e){return{bicycle:"mdi:bicycle",bird:"mdi:bird",bus:"mdi:bus",car:"mdi:car",cat:"mdi:cat",dog:"mdi:dog",motorcycle:"mdi:motorbike",person:"mdi:account",truck:"mdi:truck",visitor:"mdi:doorbell-video"}[e]||"mdi:shape"}_objectLabel(e){const t=String(e||"").toLowerCase();return t.charAt(0).toUpperCase()+t.slice(1)}_openSuggestions(e,t){const i=this._suggestState[e]||{items:[],index:-1},n=JSON.stringify(i.items||[])===JSON.stringify(t||[]);this._suggestState[e]={open:!!t.length,items:t,index:n?Math.min(i.index>=0?i.index:0,Math.max(t.length-1,0)):t.length?0:-1},this._renderSuggestions(e)}async _openMediaBrowser(e=""){const t=this._getMediaBrowserRoots(),i=""===e||null==e?"":this._normalizeMediaSourceValue(e)||t[0]||"";this._lockPageScroll(),this._mediaBrowserOpen=!0,this._mediaBrowserHistory=[],this._mediaBrowserItems=[],this._mediaBrowserPath=i,this._mediaBrowserLoading=!0,this._scheduleRender(),await this._loadMediaBrowser(i,!1)}async _loadMediaBrowser(e,t=!0){const i=null===e?null:""===e?"":this._normalizeMediaSourceValue(e);if(null==i)return;t&&this._mediaBrowserPath!==i&&this._mediaBrowserHistory.push(this._mediaBrowserPath),this._mediaBrowserLoading=!0,this._mediaBrowserPath=i,this._mediaBrowserItems=[],this._scheduleRender();const n=await this._browseMediaFolderNodes(i);this._mediaBrowserPath===i&&(this._mediaBrowserItems=n,this._mediaBrowserLoading=!1,this._scheduleRender())}_closeMediaBrowser(){this._unlockPageScroll(),this._mediaBrowserOpen=!1,this._mediaBrowserLoading=!1,this._mediaBrowserPath="",this._mediaBrowserItems=[],this._mediaBrowserHistory=[],this._scheduleRender()}async _mediaBrowserGoBack(){if(!this._mediaBrowserHistory.length)return;const e=this._mediaBrowserHistory.pop();if(void 0===e)return;this._mediaBrowserLoading=!0,this._mediaBrowserPath=e,this._mediaBrowserItems=[],this._scheduleRender();const t=await this._browseMediaFolderNodes(e);this._mediaBrowserPath===e&&(this._mediaBrowserItems=t,this._mediaBrowserLoading=!1,this._scheduleRender())}_appendMediaSourceValue(e){const t=this._normalizeMediaSourceValue(e);if(!t)return;const i=Array.isArray(this._config.media_sources)?this._config.media_sources.map(e=>String(e).trim()).filter(Boolean):[],n=new Set(i.map(e=>e.toLowerCase()));n.has(t.toLowerCase())||i.push(t);const s=this.shadowRoot?.getElementById("mediasources");s&&(s.value=i.join("\n")),this._config=this._stripAlwaysTrueKeys({...this._config,media_sources:i}),delete this._config.media_source,this._fire(),this._applyFieldValidation("mediasources"),this._closeSuggestions("mediasources"),this._scheduleRender()}_parseTextList(e){const t=String(e||"").split(/\n|,/g).map(e=>String(e||"").trim()).filter(Boolean),i=[],n=new Set;for(const e of t){const t=String(e).trim().toLowerCase();n.has(t)||(n.add(t),i.push(String(e).trim()))}return i}_prettyLabel(e){const t=String(e||"");return t?t.startsWith("media-source://")?this._toRel(t):t:""}_getStyleVariableValue(e){const t=String(this._config?.style_variables||""),i=String(e||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),n=t.match(new RegExp(`${i}\\s*:\\s*([^;]+)`));return n?n[1].trim():""}_setStyleVariable(e,t){const i=String(this._config.style_variables||"").split("\n").map(e=>e.trim()).filter(Boolean).filter(t=>!t.startsWith(e));i.push(`${e}: ${t};`),this._config=this._stripAlwaysTrueKeys({...this._config,style_variables:i.join("\n")})}_removeStyleVariable(e){const t=String(this._config.style_variables||"").split("\n").map(e=>e.trim()).filter(Boolean).filter(t=>!t.startsWith(e));this._config=this._stripAlwaysTrueKeys({...this._config,style_variables:t.join("\n")})}_createColorPicker(e,t,i){const n=this.shadowRoot?.getElementById(e);if(!n)return;n.innerHTML="";const s=document.createElement("input");s.type="color",s.className="cgc-color";const r="transparent"===i;s.value=i&&/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(i)?i:"#000000",s.disabled=r,n.appendChild(s),s.addEventListener("change",e=>{const i=e.target.value;this._setStyleVariable(t,i),this._fire(),this._scheduleRender()})}_bindColorControls(e={}){ye.forEach(e=>{e.controls.forEach(e=>{"color"===e.type&&this._createColorPicker(e.hostId,e.variable,this._getStyleVariableValue(e.variable))})}),this.shadowRoot.querySelectorAll("[data-reset]").forEach(t=>{t.addEventListener("click",()=>{const e=t.dataset.reset;this._removeStyleVariable(e),this._fire(),this._scheduleRender()},e)}),this.shadowRoot.querySelectorAll("[data-transparent]").forEach(t=>{const i=t.dataset.transparent,n=this._getStyleVariableValue(i);t.checked="transparent"===n,t.addEventListener("change",e=>{e.target.checked?this._setStyleVariable(i,"transparent"):this._removeStyleVariable(i),this._fire(),this._scheduleRender()},e)}),this.shadowRoot.querySelectorAll("[data-radius]").forEach(t=>{const i=t.dataset.radius,n=i.replace(/[^a-z0-9]/gi,"-"),s=this.shadowRoot.getElementById("radius-val-"+n);t.addEventListener("input",e=>{s&&(s.textContent=e.target.value+"px")},e),t.addEventListener("change",e=>{this._setStyleVariable(i,e.target.value+"px"),this._fire(),this._scheduleRender()},e)}),this.shadowRoot.querySelectorAll("details.style-section").forEach(t=>{t.addEventListener("toggle",()=>{const e=t.id.replace("style-section-","");t.open?this._openStyleSections.add(e):this._openStyleSections.delete(e)},e)})}_render(){const e=this._config||{};try{const e=this.shadowRoot?.activeElement;if(e&&e.id){const t="number"==typeof e.selectionStart?e.selectionStart:null,i="number"==typeof e.selectionEnd?e.selectionEnd:null;this._focusState={id:e.id,value:"string"==typeof e.value?e.value:null,start:t,end:i}}else this._focusState=null}catch(e){this._focusState=null}const t=String(e.source_mode||"sensor"),i="sensor"===t,n="media"===t,s="combined"===t,r=String(e.start_mode||"gallery"),o=Array.isArray(e.entities)?e.entities.map(String).map(e=>e.trim()).filter(Boolean):[],a=String(e.entity||"").trim(),l=o.length?o:a?[a]:[],c=this._sourcesToText(l),d=l.filter(e=>{const t=/^sensor\./i.test(e),i=!!this._hass?.states?.[e];return!t||!i}),h=Array.isArray(e.media_sources)?e.media_sources.map(String).map(e=>e.trim()).filter(Boolean):[],p=this._sourcesToText(h),u=h.some(e=>this._looksLikeFile(this._prettyLabel(e))),m=String(e.filename_datetime_format||"").trim(),g=String(e.folder_datetime_format||"").trim(),_=this._normalizeObjectFilters(e.object_filters||[]),v=_.length,b="object"==typeof e.object_colors&&null!==e.object_colors?e.object_colors:{},f=Number(e.thumb_size)||140,y=(()=>{const t=this._numInt(e.max_media,50);return this._clampInt(t,1,500)})(),w=String(e.bar_position||"top"),x=String(e.preview_position||"top"),S=String(e.object_fit||"cover"),k=(()=>{const t=String(e.thumb_bar_position||"bottom").toLowerCase().trim();return"hidden"===t?"hidden":"top"===t?"top":"bottom"})(),$="vertical"===String(e.thumb_layout||"horizontal").toLowerCase().trim()?"vertical":"horizontal",A="vertical"===$,C=this._hass?.services||{},L=Object.keys(C.shell_command||{}).map(e=>`shell_command.${e}`).sort((e,t)=>e.localeCompare(t)),M=String(e.delete_service||e.shell_command||"").trim(),E=!M||/^[a-z0-9_]+\.[a-z0-9_]+$/i.test(M),z=(()=>{const e=new Set(L);return M&&e.add(M),Array.from(e).sort((e,t)=>e.localeCompare(t))})(),T=(()=>{const t=Number(e.bar_opacity);return Number.isFinite(t)?Math.min(100,Math.max(0,t)):45})(),P=(()=>{const t=Number(e.thumbnail_frame_pct);return Number.isFinite(t)?Math.min(100,Math.max(0,Math.round(t))):0})(),F=!0===e.autoplay,H=void 0!==e.auto_muted?!0===e.auto_muted:de,R=void 0!==e.live_auto_muted?!0===e.live_auto_muted:ue,j="hidden"===w,I=Math.max(10,Math.min(28,Number(e.pill_size)||14)),V=!0===e.clean_mode,O=!0===e.persistent_controls,D=!0===e.live_enabled,B=String(e.live_camera_entity||"").trim(),N=Array.isArray(e.live_camera_entities)?e.live_camera_entities:[],q=Object.keys(this._hass?.states||{}).filter(e=>{if(!e.startsWith("camera."))return!1;const t=this._hass?.states?.[e];if(!t)return!1;const i=String(t.state||"").toLowerCase();return"unavailable"!==i&&"unknown"!==i}).sort((e,t)=>{const i=String(this._hass?.states?.[e]?.attributes?.friendly_name||e).toLowerCase(),n=String(this._hass?.states?.[t]?.attributes?.friendly_name||t).toLowerCase();return i.localeCompare(n)}),W="\n      --ed-radius-panel: 18px;\n      --ed-radius-row: 16px;\n      --ed-radius-input: 12px;\n      --ed-radius-pill: 999px;\n      --ed-space-1: 8px;\n      --ed-space-2: 12px;\n      --ed-space-3: 16px;\n      --ed-space-4: 20px;\n\n      --ed-muted: var(--cgc-editor-muted-opacity, 0.60);\n\n      --ed-text: var(--primary-text-color, rgba(0,0,0,0.87));\n      --ed-text2: var(--secondary-text-color, rgba(0,0,0,0.60));\n\n      --ed-section-bg: var(--card-background-color, #fff);\n      --ed-section-border: color-mix(\n        in srgb,\n        var(--divider-color, rgba(0,0,0,0.12)) 55%,\n        transparent\n      );\n      --ed-section-glow: var(\n        --cgc-editor-section-glow,\n        0 1px 0 rgba(255,255,255,0.02) inset\n      );\n\n      --ed-row-bg: color-mix(\n        in srgb,\n        var(--secondary-background-color, rgba(0,0,0,0.03)) 60%,\n        transparent\n      );\n      --ed-row-border: color-mix(\n        in srgb,\n        var(--divider-color, rgba(0,0,0,0.12)) 48%,\n        transparent\n      );\n\n      --ed-input-bg: var(--secondary-background-color, rgba(0,0,0,0.04));\n      --ed-input-border: color-mix(\n        in srgb,\n        var(--divider-color, rgba(0,0,0,0.14)) 58%,\n        transparent\n      );\n\n      --ed-select-bg: var(--secondary-background-color, rgba(0,0,0,0.04));\n      --ed-select-border: color-mix(\n        in srgb,\n        var(--divider-color, rgba(0,0,0,0.14)) 58%,\n        transparent\n      );\n\n      --ed-seg-bg: var(--secondary-background-color, rgba(0,0,0,0.04));\n      --ed-seg-border: color-mix(\n        in srgb,\n        var(--divider-color, rgba(0,0,0,0.12)) 52%,\n        transparent\n      );\n      --ed-seg-txt: var(--secondary-text-color, rgba(0,0,0,0.60));\n      --ed-seg-on-bg: var(--primary-text-color, rgba(0,0,0,0.88));\n      --ed-seg-on-txt: var(--primary-background-color, rgba(255,255,255,0.98));\n\n      --ed-tab-bg: var(--secondary-background-color, rgba(0,0,0,0.03));\n      --ed-tab-border: color-mix(\n        in srgb,\n        var(--divider-color, rgba(0,0,0,0.12)) 52%,\n        transparent\n      );\n      --ed-tab-txt: var(--secondary-text-color, rgba(0,0,0,0.60));\n      --ed-tab-on-bg: color-mix(\n        in srgb,\n        var(--primary-color, #03a9f4) 14%,\n        var(--secondary-background-color, rgba(0,0,0,0.04))\n      );\n      --ed-tab-on-border: var(--primary-color, #03a9f4);\n      --ed-tab-on-txt: var(--primary-text-color, rgba(0,0,0,0.88));\n\n      --ed-chip-bg: var(--secondary-background-color, rgba(0,0,0,0.03));\n      --ed-chip-border: color-mix(\n        in srgb,\n        var(--divider-color, rgba(0,0,0,0.12)) 52%,\n        transparent\n      );\n      --ed-chip-disabled: 0.50;\n      --ed-chip-txt: var(--primary-text-color, rgba(0,0,0,0.88));\n      --ed-chip-icon-bg: color-mix(\n        in srgb,\n        var(--secondary-background-color, rgba(0,0,0,0.03)) 80%,\n        transparent\n      );\n      --ed-chip-on-bg: color-mix(\n        in srgb,\n        var(--primary-color, #03a9f4) 12%,\n        var(--secondary-background-color, rgba(0,0,0,0.03))\n      );\n      --ed-chip-on-border: var(--primary-color, #03a9f4);\n      --ed-chip-on-txt: var(--primary-text-color, rgba(0,0,0,0.92));\n      --ed-chip-on-icon-bg: color-mix(\n        in srgb,\n        var(--primary-color, #03a9f4) 18%,\n        transparent\n      );\n\n      --ed-pill-bg: var(--secondary-background-color, rgba(0,0,0,0.08));\n      --ed-pill-border: color-mix(\n        in srgb,\n        var(--divider-color, rgba(0,0,0,0.14)) 58%,\n        transparent\n      );\n      --ed-pill-txt: var(--primary-text-color, rgba(0,0,0,0.88));\n\n      --ed-sugg-bg: var(--card-background-color, #fff);\n      --ed-sugg-border: color-mix(\n        in srgb,\n        var(--divider-color, rgba(0,0,0,0.14)) 60%,\n        transparent\n      );\n      --ed-sugg-hover: var(--secondary-background-color, rgba(0,0,0,0.045));\n      --ed-sugg-active: color-mix(\n        in srgb,\n        var(--primary-color, #03a9f4) 10%,\n        var(--secondary-background-color, rgba(0,0,0,0.04))\n      );\n\n      --ed-arrow: var(--secondary-text-color, rgba(0,0,0,0.58));\n      --ed-focus-ring: color-mix(\n        in srgb,\n        var(--primary-color, #03a9f4) 20%,\n        transparent\n      );\n\n      --ed-valid: var(--success-color, rgba(46,160,67,0.95));\n      --ed-valid-glow: color-mix(\n        in srgb,\n        var(--success-color, rgba(46,160,67,0.95)) 20%,\n        transparent\n      );\n\n      --ed-invalid: var(--error-color, rgba(219,68,55,0.92));\n      --ed-invalid-glow: color-mix(\n        in srgb,\n        var(--error-color, rgba(219,68,55,0.92)) 20%,\n        transparent\n      );\n\n      --ed-warning: var(--warning-color, rgba(245,158,11,0.95));\n      --ed-warning-bg: color-mix(\n        in srgb,\n        var(--warning-color, rgba(245,158,11,0.95)) 10%,\n        transparent\n      );\n      --ed-warning-border: color-mix(\n        in srgb,\n        var(--warning-color, rgba(245,158,11,0.95)) 24%,\n        transparent\n      );\n      --ed-warning-icon-bg: color-mix(\n        in srgb,\n        var(--warning-color, rgba(245,158,11,0.95)) 14%,\n        transparent\n      );\n\n      --ed-success-bg: color-mix(\n        in srgb,\n        var(--success-color, rgba(46,160,67,0.95)) 10%,\n        transparent\n      );\n      --ed-success-border: color-mix(\n        in srgb,\n        var(--success-color, rgba(46,160,67,0.95)) 24%,\n        transparent\n      );\n      --ed-success-icon-bg: color-mix(\n        in srgb,\n        var(--success-color, rgba(46,160,67,0.95)) 14%,\n        transparent\n      );\n\n      --ed-shadow-soft: var(\n        --cgc-editor-shadow-soft,\n        0 8px 24px rgba(0,0,0,0.10)\n      );\n      --ed-shadow-float: var(\n        --cgc-editor-shadow-float,\n        0 14px 36px rgba(0,0,0,0.18)\n      );\n      --ed-shadow-press: var(\n        --cgc-editor-shadow-press,\n        0 6px 16px rgba(0,0,0,0.10)\n      );\n      --ed-shadow-chip: var(\n        --cgc-editor-shadow-chip,\n        0 8px 18px rgba(0,0,0,0.08)\n      );\n      --ed-shadow-modal: var(\n        --cgc-editor-shadow-modal,\n        0 24px 60px rgba(0,0,0,0.28)\n      );\n      --ed-backdrop: var(--cgc-editor-backdrop, rgba(0,0,0,0.68));\n    ",U=(e,t,i)=>`\n      <button\n        type="button"\n        class="tabbtn ${this._activeTab===e?"on":""}"\n        data-tab="${e}"\n      >\n        ${fe(i,16)}\n        <span>${t}</span>\n      </button>\n    `,K=this._mediaBrowserOpen?`\n        <div class="browser-backdrop" id="browser-backdrop"></div>\n        <div class="browser-modal" role="dialog" aria-modal="true" aria-label="Browse media folders">\n          <div class="browser-head">\n            <div class="browser-head-copy">\n              <div class="browser-title">Browse folders</div>\n              <div class="browser-path">${this._mediaBrowserPath||"—"}</div>\n            </div>\n            <button type="button" class="browser-iconbtn" id="browser-close" title="Close">\n              ${fe("mdi:close",18)}\n            </button>\n          </div>\n\n          <div class="browser-toolbar">\n            <button\n              type="button"\n              class="browser-btn ${this._mediaBrowserHistory.length?"":"disabled"}"\n              id="browser-back"\n              ${this._mediaBrowserHistory.length?"":"disabled"}\n            >\n              ${fe("mdi:arrow-left",18)}\n              <span>Back</span>\n            </button>\n\n            <button\n              type="button"\n              class="browser-btn primary"\n              id="browser-select-current"\n              ${this._mediaBrowserPath?"":"disabled"}\n            >\n              ${fe("mdi:check",18)}\n              <span>Use current folder</span>\n            </button>\n          </div>\n\n          <div class="browser-body">\n            ${this._mediaBrowserLoading?'<div class="browser-empty">Loading folders…</div>':this._mediaBrowserItems.length?`\n                    <div class="browser-list">\n                      ${this._mediaBrowserItems.map(e=>`\n                            <div class="browser-item">\n                              <button\n                                type="button"\n                                class="browser-open"\n                                data-browser-open="${e.id.replace(/"/g,"&quot;")}"\n                                title="${e.id.replace(/"/g,"&quot;")}"\n                              >\n                                <span class="browser-open-icon">\n                                  ${fe("mdi:folder-outline",20)}\n                                </span>\n                                <span class="browser-open-copy">\n                                  <span class="browser-open-title">${e.title}</span>\n                                  <span class="browser-open-sub">${e.id}</span>\n                                </span>\n                              </button>\n\n                              <button\n                                type="button"\n                                class="browser-select"\n                                data-browser-select="${e.id.replace(/"/g,"&quot;")}"\n                                title="Select folder"\n                              >\n                                Select\n                              </button>\n                            </div>\n                          `).join("")}\n                    </div>\n                  `:'<div class="browser-empty">No folders found here.</div>'}\n          </div>\n        </div>\n      `:"",Y=()=>"general"===this._activeTab?`\n            <div class="tabpanel" data-panel="general">\n              <div class="row">\n                <div class="lbl">Default view</div>\n                <div class="segwrap">\n                  <button class="seg ${"live"!==r?"on":""}" data-startmode="gallery">Gallery</button>\n                  <button class="seg ${"live"===r?"on":""}" data-startmode="live">Live</button>\n                </div>\n              </div>\n\n              <div class="row">\n                <div class="lbl">Source</div>\n                <div class="segwrap">\n                  <button class="seg ${i?"on":""}" data-src="sensor">File sensor</button>\n                  <button class="seg ${n?"on":""}" data-src="media">Media folders</button>\n                  <button class="seg ${s?"on":""}" data-src="combined">Combined</button>\n                </div>\n\n                ${i?`\n                <div style="margin-top:10px;">\n                  <div class="field" id="entities-field">\n                    <textarea id="entities" rows="4" placeholder="Enter one sensor per line"></textarea>\n                    <div class="suggestions" id="entities-suggestions" hidden></div>\n                  </div>\n                  ${d.length?`<div class="desc">⚠️ Invalid / missing sensor(s): <code>${d.join("</code>, <code>")}</code></div>`:""}\n                  ${this._renderFilesWizard()}\n                </div>\n                `:n?`\n                <div style="margin-top:10px;">\n                  <div class="field" id="mediasources-field">\n                    <textarea id="mediasources" rows="4" placeholder="Enter one folder per line, or browse and select folders"></textarea>\n                    <div class="suggestions" id="mediasources-suggestions" hidden></div>\n                  </div>\n                  <div class="row-actions">\n                    <button type="button" class="actionbtn" id="browse-media-folders">${fe("mdi:folder-search-outline",18)}<span>Browse</span></button>\n                    <button type="button" class="actionbtn" id="clear-media-folders">${fe("mdi:delete-outline",18)}<span>Clear</span></button>\n                  </div>\n                  ${u?'<div class="desc">⚠️ One of your entries looks like a file (extension). This field expects folders.</div>':""}\n                </div>\n                `:`\n                <div style="margin-top:10px;">\n                  <div class="lbl" style="margin-bottom:6px;">File sensor(s)</div>\n                  <div class="field" id="entities-field">\n                    <textarea id="entities" rows="3" placeholder="Enter one sensor per line"></textarea>\n                    <div class="suggestions" id="entities-suggestions" hidden></div>\n                  </div>\n                  ${d.length?`<div class="desc">⚠️ Invalid / missing sensor(s): <code>${d.join("</code>, <code>")}</code></div>`:""}\n                  <div class="lbl" style="margin-top:12px;margin-bottom:6px;">Media folder(s)</div>\n                  <div class="field" id="mediasources-field">\n                    <textarea id="mediasources" rows="3" placeholder="Enter one folder per line, or browse and select folders"></textarea>\n                    <div class="suggestions" id="mediasources-suggestions" hidden></div>\n                  </div>\n                  <div class="row-actions">\n                    <button type="button" class="actionbtn" id="browse-media-folders">${fe("mdi:folder-search-outline",18)}<span>Browse</span></button>\n                    <button type="button" class="actionbtn" id="clear-media-folders">${fe("mdi:delete-outline",18)}<span>Clear</span></button>\n                  </div>\n                  ${u?'<div class="desc">⚠️ One of your entries looks like a file (extension). This field expects folders.</div>':""}\n                </div>\n                `}\n              ${n||s?`\n              <div class="row" style="margin-top:4px;">\n                <div class="lbl">Frigate URL (optional)</div>\n                <div class="desc">Direct Frigate API URL (e.g. <code>http://192.168.1.x:5000</code>). If set, clips load instantly via Frigate REST API instead of the media-source walk.</div>\n                <div class="field">\n                  <input type="text" class="ed-input" id="frigate_url" placeholder="http://192.168.1.x:5000" autocomplete="off" value="${this._config.frigate_url||""}" />\n                </div>\n              </div>\n              `:""}\n              </div>\n\n              <div class="row">\n                <details ${e.folder_datetime_format||e.filename_datetime_format?"open":""}>\n                  <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;">\n                    <span class="lbl" style="margin:0;flex:1;">Datetime formats</span>\n                    <span class="details-chevron" style="transition:transform 0.15s;">${fe("mdi:chevron-right",16)}</span>\n                  </summary>\n                  <div style="padding-top:10px;display:flex;flex-direction:column;gap:14px;">\n                    <div>\n                      <div class="lbl">Folder datetime format</div>\n                      <input type="text" class="ed-input" id="folderfmt" placeholder="DDMM" style="margin-top:4px;" />\n                      <div class="hint" style="margin-top:4px;">\n                        ${fe("mdi:information-outline",14)}\n                        Examples: <code>DDMM</code>, <code>YYYYMMDD</code>, <code>DD-MM-YYYY</code>. Year defaults to current year if omitted.\n                      </div>\n                    </div>\n                    <div>\n                      <div class="lbl">Filename datetime format</div>\n                      <input type="text" class="ed-input" id="filenamefmt" placeholder="YYYYMMDDHHmmss" style="margin-top:4px;" />\n                      <div class="hint" style="margin-top:4px;">\n                        ${fe("mdi:information-outline",14)}\n                        Examples: <code>YYYYMMDDHHmmss</code>, <code>DD-MM-YYYY_HH-mm-ss</code>, <code>YYYY-MM-DDTHH:mm:ss</code>\n                      </div>\n                    </div>\n                  </div>\n                </details>\n              </div>\n\n              <div class="row ${n?"row-disabled":""}">\n                <div class="lbl">Delete service</div>\n                <div class="hint">\n                  ${n?`\n                    ${fe("mdi:information-outline",14)}\n                    <span>Delete is not available in <strong>Media folders</strong> mode. Media-source items don't map to filesystem paths the shell command can delete — switch the source above to enable.</span>\n                  `:`\n                    ${fe("mdi:help-circle-outline",14)}\n                    <a\n                      href="https://github.com/TheScubadiver/camera-gallery-card?tab=readme-ov-file#delete-setup"\n                      target="_blank"\n                      rel="noopener noreferrer"\n                    >\n                      How to configure the shell command\n                    </a>\n                  `}\n                </div>\n\n                <div class="selectwrap">\n                  <select class="select ${E?"":"invalid"}" id="delservice" ${n?"disabled":""}>\n                    ${z.length?'<option value=""></option>'+z.map(e=>`<option value="${e}" ${e===M?"selected":""}>${e}</option>`).join(""):'<option value="" selected>(no shell_command services found)</option>'}\n                  </select>\n                  <span class="selarrow"></span>\n                </div>\n              </div>\n            </div>\n          `:"viewer"===this._activeTab?`\n            <div class="tabpanel" data-panel="viewer">\n              <div class="row">\n                <div class="lbl">Image fit</div>\n                <div class="segwrap">\n                  <button class="seg ${"cover"===S?"on":""}" data-objfit="cover">Cover</button>\n                  <button class="seg ${"contain"===S?"on":""}" data-objfit="contain">Contain</button>\n                </div>\n              </div>\n\n              <div class="row">\n                <div class="lbl">Position</div>\n                <div class="segwrap">\n                  <button class="seg ${"top"===x?"on":""}" data-ppos="top">Top</button>\n                  <button class="seg ${"bottom"===x?"on":""}" data-ppos="bottom">Bottom</button>\n                </div>\n              </div>\n\n              <div class="row">\n                <div class="row-head">\n                  <div>\n                    <div class="lbl">Clean mode</div>\n                  </div>\n\n                  <div class="togrow">\n                    <label class="cgc-switch"><input type="checkbox" id="cleanmode" ${V?"checked":""}><span class="cgc-track"></span></label>\n                  </div>\n                </div>\n              </div>\n\n              <div class="row">\n                <div class="lbl">Controls position</div>\n                <div class="segwrap">\n                  <button class="seg ${"overlay"===(e.controls_mode??"overlay")?"on":""}" data-ctrlmode="overlay">Overlay</button>\n                  <button class="seg ${"fixed"===e.controls_mode?"on":""}" data-ctrlmode="fixed">Fixed</button>\n                </div>\n              </div>\n\n              <div class="row">\n                <div class="row-head">\n                  <div>\n                    <div class="lbl">Show camera name</div>\n                  </div>\n                  <div class="togrow">\n                    <label class="cgc-switch"><input type="checkbox" id="showcameratitle" ${!1!==e.show_camera_title?"checked":""} ${"fixed"===e.controls_mode?"disabled":""}><span class="cgc-track"></span></label>\n                  </div>\n                </div>\n              </div>\n\n              <div class="row">\n                <div class="row-head">\n                  <div>\n                    <div class="lbl">Persistent controls</div>\n                    <div class="desc">\n                      Always show controls.\n                    </div>\n                  </div>\n\n                  <div class="togrow">\n                    <label class="cgc-switch"><input type="checkbox" id="persistentcontrols" ${O?"checked":""}><span class="cgc-track"></span></label>\n                  </div>\n                </div>\n              </div>\n\n              <div class="row">\n                <div class="subrows">\n                  <div class="row-head">\n                    <div class="lbl">Autoplay</div>\n                    <div class="togrow">\n                      <label class="cgc-switch"><input type="checkbox" id="autoplay"><span class="cgc-track"></span></label>\n                    </div>\n                  </div>\n\n                  <div class="row-head">\n                    <div class="lbl">Auto muted</div>\n                    <div class="togrow">\n                      <label class="cgc-switch"><input type="checkbox" id="auto_muted"><span class="cgc-track"></span></label>\n                    </div>\n                  </div>\n                </div>\n              </div>\n\n            </div>\n          `:"live"===this._activeTab?`\n            <div class="tabpanel" data-panel="live">\n              <div class="row ">\n                <div class="row-head">\n                  <div class="lbl">Live preview</div>\n\n                  <div class="togrow">\n                    <label class="cgc-switch"><input type="checkbox" id="liveenabled" ${D?"checked":""} ><span class="cgc-track"></span></label>\n                  </div>\n                </div>\n\n              </div>\n\n              ${D?`\n                ${q.length>1?`\n                <div class="row">\n                  <div class="lbl">Visible cameras in picker</div>\n                  <div class="desc">Select cameras for the picker. At least one camera must be added to enable live mode.</div>\n                  ${(()=>{const e=Array.isArray(this._config.live_stream_urls)&&this._config.live_stream_urls.length>0?this._config.live_stream_urls.filter(e=>e?.url):this._config.live_stream_url?[{url:this._config.live_stream_url,name:this._config.live_stream_name||"Stream"}]:[];return e.length>0?`\n                      <div class="livecam-tags">\n                        ${e.map((t,i)=>`<div class="livecam-tag"><span style="opacity:0.5;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;">stream ${e.length>1?i+1:""}</span><span style="margin-left:4px;">${t.name||"Stream"}</span></div>`).join("")}\n                      </div>`:""})()}\n                  ${N.length>0?`\n                  <div class="livecam-tags" id="livecam-tags-dnd">\n                    ${N.map((e,t)=>`<div class="livecam-tag" draggable="true" data-dragcam="${e}"><span class="livecam-tag-grip">⠿</span><span class="livecam-tag-num">${t+1}</span><span>${String(this._hass?.states?.[e]?.attributes?.friendly_name||e).trim()}</span><span class="livecam-tag-entity">${e}</span><button type="button" class="livecam-tag-del" data-delcam="${e}">×</button></div>`).join("")}\n                  </div>\n                  `:""}\n                  <div class="field" style="margin-top:6px;">\n                    <input type="text" class="ed-input" id="livecam-input" placeholder="Search cameras..." autocomplete="off" />\n                    <div class="suggestions" id="livecam-suggestions" hidden></div>\n                  </div>\n                </div>\n                `:""}\n\n                <div class="row ">\n                  <div class="lbl">Default live camera</div>\n                  ${B?`\n                  <div class="livecam-tags">\n                    <div class="livecam-tag"><span>${B.startsWith("__cgc_stream")?this._getStreamEntryById(B)?.name||"Stream":String(this._hass?.states?.[B]?.attributes?.friendly_name||B).trim()}</span><span class="livecam-tag-entity">${B.startsWith("__cgc_stream")?"stream url":B}</span><button type="button" class="livecam-tag-del" data-deldefcam="${B}">×</button></div>\n                  </div>\n                  ${"__cgc_stream__"!==B&&N.length>0&&!N.includes(B)?`\n                  <div class="cgc-inline-warn">${fe("mdi:alert-outline",14)}<span>This camera is not in the visible cameras list. It will not appear in the picker.</span></div>\n                  `:""}\n                  `:""}\n                  \n                  <div class="field" style="margin-top:6px;">\n                    <input type="text" class="ed-input" id="livedefault-input" placeholder="Search cameras..." autocomplete="off" ${B?'style="display:none;"':""} />\n                    <div class="suggestions" id="livedefault-suggestions" hidden></div>\n                  </div>\n                  \n                </div>\n\n                <div class="row">\n                  <div class="lbl">Stream URLs</div>\n                  <div class="desc">Optional. Add one or more RTSP/HLS/RTMP stream URLs. Each gets its own entry in the camera picker.</div>\n                  <div id="stream-urls-list">\n                    ${(()=>(()=>Array.isArray(this._config.live_stream_urls)&&this._config.live_stream_urls.length>0?this._config.live_stream_urls:this._config.live_stream_url?[{url:this._config.live_stream_url,name:this._config.live_stream_name||""}]:[])().map((e,t)=>`\n                        <div class="stream-url-row" data-si="${t}" style="display:flex;flex-direction:column;gap:4px;padding:8px 0 8px 0;border-bottom:1px solid var(--divider-color,#e0e0e0);">\n                          <div style="display:flex;gap:6px;align-items:center;">\n                            <input type="text" class="ed-input stream-url-input" data-si="${t}" placeholder="rtsp://192.168.1.x:554/stream" autocomplete="off" value="${(e.url||"").replace(/"/g,"&quot;")}" style="flex:1;" />\n                            <button type="button" class="livecam-tag-del stream-url-del" data-si="${t}" style="flex-shrink:0;">×</button>\n                          </div>\n                          <input type="text" class="ed-input stream-name-input" data-si="${t}" placeholder="Name (e.g. Front door)" autocomplete="off" value="${(e.name||"").replace(/"/g,"&quot;")}" />\n                        </div>\n                      `).join(""))()}\n                  </div>\n                  <button type="button" id="stream-url-add" class="cgc-ed-btn" style="margin-top:8px;">+ Add stream URL</button>\n                </div>\n\n\n                <div class="row">\n                  <div class="row-head">\n                    <div class="lbl">Auto muted</div>\n                    <div class="togrow">\n                      <label class="cgc-switch"><input type="checkbox" id="live_auto_muted"><span class="cgc-track"></span></label>\n                    </div>\n                  </div>\n                </div>\n\n                <div class="row">\n                  <div class="lbl">Menu buttons</div>\n                  <div class="desc">Buttons shown in the hamburger menu during live view.</div>\n                  ${(()=>{const e=Array.isArray(this._config.menu_buttons)?this._config.menu_buttons:[];return e.length?`\n                      <div class="menubtn-list">\n                        ${e.map((e,t)=>`\n                          <div class="menubtn-card">\n                            <div class="menubtn-card-header">\n                              <span style="flex:1;font-size:0.82em;opacity:0.65;">${(e.title||e.entity||"Button "+(t+1)).replace(/</g,"&lt;")}</span>\n                              <button type="button" class="livecam-tag-del" data-delmenubutton="${t}">×</button>\n                            </div>\n                            <div class="menubtn-fields">\n                              <div style="grid-column:1/-1;">\n                                <div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">Entity</div>\n                                <div class="field">\n                                  <input type="text" class="ed-input" data-menubtn-entity="${t}" placeholder="entity_id" value="${(e.entity||"").replace(/"/g,"&quot;")}" autocomplete="off" />\n                                  <div class="suggestions" data-menubtn-entity-sugg="${t}" hidden></div>\n                                </div>\n                              </div>\n                              <div>\n                                <div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">Icon (off)</div>\n                                <div class="field">\n                                  <input type="text" class="ed-input" data-menubtn="${t}" data-mbfield="icon" value="${(e.icon||"").replace(/"/g,"&quot;")}" placeholder="mdi:lightbulb" autocomplete="off" />\n                                  <div class="suggestions" data-menubtn-icon-sugg="${t}" hidden></div>\n                                </div>\n                              </div>\n                              <div>\n                                <div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">Icon (on)</div>\n                                <div class="field">\n                                  <input type="text" class="ed-input" data-menubtn="${t}" data-mbfield="icon_on" value="${(e.icon_on||"").replace(/"/g,"&quot;")}" placeholder="mdi:lightbulb" autocomplete="off" />\n                                  <div class="suggestions" data-menubtn-iconon-sugg="${t}" hidden></div>\n                                </div>\n                              </div>\n                              <div>\n                                <div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">Label</div>\n                                <div class="field"><input type="text" class="ed-input" data-menubtn="${t}" data-mbfield="title" value="${(e.title||"").replace(/"/g,"&quot;")}" placeholder="optional" /></div>\n                              </div>\n                              <div>\n                                <div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">Service</div>\n                                <div class="field"><input type="text" class="ed-input" data-menubtn="${t}" data-mbfield="service" value="${(e.service||"").replace(/"/g,"&quot;")}" placeholder="e.g. light.toggle" /></div>\n                              </div>\n                              <div>\n                                <div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">State (on)</div>\n                                <div class="field"><input type="text" class="ed-input" data-menubtn="${t}" data-mbfield="state_on" value="${(e.state_on||"").replace(/"/g,"&quot;")}" placeholder="e.g. open" /></div>\n                              </div>\n                            </div>\n                          </div>\n                        `).join("")}\n                      </div>\n                    `:""})()}\n                  <div style="margin-top:8px;border:1px solid var(--ed-input-border);border-radius:var(--ed-radius-input,8px);padding:8px 10px;">\n                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">\n                      <div style="grid-column:1/-1;">\n                        <div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">Entity</div>\n                        <div class="field">\n                          <input type="text" class="ed-input" id="menubtn-entity-input" placeholder="Search entity..." autocomplete="off" />\n                          <div class="suggestions" id="menubtn-entity-sugg" hidden></div>\n                        </div>\n                      </div>\n                      <div>\n                        <div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">Icon (off)</div>\n                        <div class="field">\n                          <input type="text" class="ed-input" id="menubtn-icon-input" placeholder="mdi:lightbulb" autocomplete="off" />\n                          <div class="suggestions" id="menubtn-icon-sugg" hidden></div>\n                        </div>\n                      </div>\n                      <div style="display:flex;align-items:flex-end;">\n                        <button type="button" id="menubtn-add-btn" class="actionbtn" style="width:100%;justify-content:center;">+ Add</button>\n                      </div>\n                    </div>\n                  </div>\n                </div>\n              `:""}\n\n            </div>\n          `:"thumbs"===this._activeTab?`\n            <div class="tabpanel" data-panel="thumbs">\n              <div class="row">\n                <div class="lbl">Thumbnail layout</div>\n                <div class="segwrap">\n                  <button class="seg ${"horizontal"===$?"on":""}" data-tlayout="horizontal">Horizontal</button>\n                  <button class="seg ${"vertical"===$?"on":""}" data-tlayout="vertical">Vertical</button>\n                </div>\n              </div>\n\n              <div class="row ${A?"muted":""}">\n                <div class="lbl">Thumbnail size</div>\n                <div class="desc">Set the size of each thumbnail in pixels</div>\n                <div class="ed-input-row"><input type="number" class="ed-input" id="thumb" /><span class="ed-suffix">px</span></div>\n              </div>\n\n              <div class="row">\n                <div class="lbl">Maximum thumbnails shown</div>\n                <div class="ed-input-row"><input type="number" class="ed-input" id="maxmedia" /><span class="ed-suffix">items</span></div>\n              </div>\n\n              <div class="row">\n                <div class="lbl">Video thumbnail frame</div>\n                <div class="desc">% of the video to capture as thumbnail (0 = first frame, 100 = last)</div>\n                <div class="barrow">\n                  <div class="barrow-top">\n                    <div class="pillval" id="thumbpctval">${P}%</div>\n                  </div>\n                  <input type="range" class="cgc-range" id="thumbpct" min="0" max="100" step="1">\n                </div>\n              </div>\n\n              <div class="row">\n                <div class="lbl">Thumbnail bar position</div>\n                <div class="segwrap">\n                  <button class="seg ${"top"===k?"on":""}" data-tbpos="top">Top</button>\n                  <button class="seg ${"bottom"===k?"on":""}" data-tbpos="bottom">Bottom</button>\n                  <button class="seg ${"hidden"===k?"on":""}" data-tbpos="hidden">Hidden</button>\n                </div>\n              </div>\n\n              <div class="row">\n                <div class="lbl">Pill position</div>\n                <div class="segwrap">\n                  <button class="seg ${"top"===w?"on":""}" data-pos="top">Top</button>\n                  <button class="seg ${"bottom"===w?"on":""}" data-pos="bottom">Bottom</button>\n                  <button class="seg ${"hidden"===w?"on":""}" data-pos="hidden">Hidden</button>\n                </div>\n              </div>\n\n              <div class="row ${j?"muted":""}">\n                <div class="lbl">Opacity pill</div>\n                <div class="barrow">\n                  <div class="barrow-top">\n                    <div class="pillval" id="barval">${T}%</div>\n                  </div>\n                  <input type="range" class="cgc-range" id="barop" min="0" max="100" step="1" ${j?"disabled":""}>\n                </div>\n              </div>\n\n              <div class="row ${j?"muted":""}">\n                <div class="lbl">Pill size</div>\n                <div class="barrow">\n                  <div class="barrow-top">\n                    <div class="pillval" id="pillsizeval">${I}px</div>\n                  </div>\n                  <input type="range" class="cgc-range" id="pillsize" min="10" max="28" step="1" ${j?"disabled":""}>\n                </div>\n              </div>\n\n              <div class="row">\n                <div class="lbl">Object filters</div>\n                <div class="objmeta">\n                  <div class="countpill">Selected ${v}/9</div>\n                </div>\n\n                <div class="chip-grid">\n                  ${ce.map(e=>{const t=_.includes(e),i=b[e]||"",n=i&&/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(i)?i:"#ffffff";return`\n                      <button\n                        type="button"\n                        class="objchip ${t?"on":""}"\n                        data-objchip="${e}"\n                        title="${this._objectLabel(e)}"\n                      >\n                        <span class="objchip-icon" ${i?`style="color:${i}"`:""}>\n                          ${fe(this._objectIcon(e),18)}\n                        </span>\n                        <span class="objchip-color">\n                          <input type="color" class="cgc-color" value="${n}" style="${i?"":"opacity:0.35"}" data-filtercolor="${e}">\n                        </span>\n                        <input type="checkbox" class="objchip-native-check" ${t?"checked":""} tabindex="-1" aria-hidden="true" style="pointer-events:none;">\n                      </button>\n                    `}).join("")}\n                </div>\n\n              <div class="row">\n                <div class="lbl">Custom Object Filters</div>\n\n                  <div class="custom-filter-add">\n                    <input type="text" class="ed-input" id="new-filter-name" placeholder="e.g. parcel" />\n                    <input type="text" class="ed-input" id="new-filter-icon" placeholder="mdi:shape" />\n                    <button class="actionbtn" id="add-filter-btn">\n                      ${fe("mdi:plus",18)}\n                      Add filter\n                    </button>\n                  </div>\n\n                <div class="custom-filter-list">\n                  ${_.filter(e=>"object"==typeof e).map((e,t)=>{const i=Object.keys(e)[0],n=e[i],s=b[i]||"",r=s&&/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)?s:"#ffffff";return`\n                      <div class="custom-item">\n                        <div class="custom-item-info">\n                          <ha-icon icon="${n}" style="${s?"color:"+s:""}"></ha-icon>\n                          <span class="lbl">${this._objectLabel(i)}</span>\n                        </div>\n                        <div class="color-controls">\n                          <input type="color" class="cgc-color" value="${r}" style="${s?"":"opacity:0.35"}" data-filtercolor="${i}">\n                          <button class="remove-btn" data-remove-index="${i}">\n                            ${fe("mdi:delete-outline",18)}\n                          </button>\n                        </div>\n                      </div>\n                    `}).join("")}\n                </div>\n              </div>\n\n              </div>\n            </div>\n          `:"styling"===this._activeTab?`\n              <div class="tabpanel" data-panel="styling">\n                <div class="style-sections">\n                  ${ye.map(e=>`\n                    <details\n                      class="style-section"\n                      id="style-section-${e.id}"\n                      ${this._openStyleSections.has(e.id)?"open":""}\n                    >\n                      <summary class="style-section-head">\n                        ${fe(e.icon,18)}\n                        <span>${e.label}</span>\n                        <span class="style-chevron">${fe("mdi:chevron-down",18)}</span>\n                      </summary>\n                      <div class="style-section-body">\n                        <div class="color-grid">\n                          ${e.controls.map(e=>{if("color"===e.type)return`\n                                <div class="color-row">\n                                  <div class="lbl">${e.label}</div>\n                                  <div class="color-controls">\n                                    <div id="${e.hostId}"></div>\n                                    <label class="color-transparent">\n                                      <input type="checkbox" data-transparent="${e.variable}">\n                                      Transparent\n                                    </label>\n                                    <button type="button" class="color-reset" data-reset="${e.variable}" title="Reset to default">\n                                      ${fe("mdi:backup-restore",16)}\n                                    </button>\n                                  </div>\n                                </div>\n                              `;if("radius"===e.type){const t=this._getStyleVariableValue(e.variable),i=t?parseInt(t):e.default,n=e.variable.replace(/[^a-z0-9]/gi,"-");return`\n                                <div class="color-row">\n                                  <div class="lbl">${e.label}</div>\n                                  <div class="color-controls">\n                                    <input\n                                      type="range"\n                                      class="radius-range"\n                                      data-radius="${e.variable}"\n                                      min="${e.min}"\n                                      max="${e.max}"\n                                      value="${i}"\n                                    >\n                                    <span class="radius-value" id="radius-val-${n}">${i}px</span>\n                                    <button type="button" class="color-reset" data-reset="${e.variable}" title="Reset to default">\n                                      ${fe("mdi:backup-restore",16)}\n                                    </button>\n                                  </div>\n                                </div>\n                              `}return""}).join("")}\n                        </div>\n                      </div>\n                    </details>\n                  `).join("")}\n                </div>\n              </div>\n            `:"";if(this._editorRendered){const e=Y(),t=this.shadowRoot.querySelector(".wrap");t&&t.setAttribute("style",W),this.shadowRoot.querySelectorAll("[data-tab]").forEach(e=>{e.classList.toggle("on",e.dataset.tab===this._activeTab)});const i=this.shadowRoot.querySelector(".tabpanel"),n=document.createElement("div");n.innerHTML=e,i&&n.firstElementChild?i.replaceWith(n.firstElementChild):!i&&n.firstElementChild&&this.shadowRoot.querySelector(".tabbar")?.insertAdjacentElement("afterend",n.firstElementChild);const s=this.shadowRoot.getElementById("cgc-browser-slot");s&&(s.innerHTML=K)}else this.shadowRoot.innerHTML=`\n      <style>\n        :host {\n          display: block;\n          padding: 8px 0;\n          color: var(--ed-text);\n          box-sizing: border-box;\n          min-width: 0;\n          scrollbar-width: none;\n        }\n        :host::-webkit-scrollbar { display: none; }\n\n        .wrap {\n          display: grid;\n          gap: var(--ed-space-3);\n          min-width: 0;\n        }\n\n        .desc,\n        code {\n          overflow-wrap: anywhere;\n          word-break: break-word;\n        }\n\n        .tabs {\n          display: grid;\n          gap: var(--ed-space-3);\n        }\n\n        .tabbar {\n          display: grid;\n          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));\n          gap: 10px;\n          padding: 10px;\n          border-radius: var(--ed-radius-panel);\n          background: var(--ed-section-bg);\n          border: 1px solid var(--ed-section-border);\n          box-shadow: var(--ed-section-glow);\n        }\n\n        .tabbtn {\n          appearance: none;\n          -webkit-appearance: none;\n          border: 1px solid var(--ed-tab-border);\n          background: var(--ed-tab-bg);\n          color: var(--ed-tab-txt);\n          border-radius: 14px;\n          min-height: 46px;\n          padding: 10px 14px;\n          cursor: pointer;\n          font-size: 13px;\n          font-weight: 900;\n          display: flex;\n          align-items: center;\n          justify-content: center;\n          gap: 8px;\n          text-align: center;\n          transition:\n            background 0.18s ease,\n            border-color 0.18s ease,\n            color 0.18s ease,\n            transform 0.18s ease,\n            box-shadow 0.18s ease;\n          min-width: 0;\n          box-shadow: var(--ed-section-glow);\n        }\n\n        .tabbtn:hover {\n          border-color: var(--ed-tab-border);\n        }\n\n        .tabbtn .cgc-svg-icon {\n          flex: 0 0 auto;\n        }\n\n        .tabbtn.on {\n          background: var(--ed-tab-on-bg);\n          border-color: var(--ed-tab-on-border);\n          color: var(--ed-tab-on-txt);\n          box-shadow: var(--ed-shadow-press);\n        }\n\n        .tabpanel {\n          padding: 16px;\n          padding-right: 20px;\n          border-radius: var(--ed-radius-panel);\n          background: var(--ed-section-bg);\n          border: 1px solid var(--ed-section-border);\n          display: grid;\n          gap: 14px;\n          align-content: start;\n          box-shadow: var(--ed-section-glow);\n          box-sizing: border-box;\n          scrollbar-width: none;\n        }\n        .tabpanel::-webkit-scrollbar { display: none; }\n        .wrap { scrollbar-width: none; }\n        .wrap::-webkit-scrollbar { display: none; }\n\n        .panelhead {\n          display: flex;\n          align-items: center;\n          gap: 4px;\n          padding-bottom: 6px;\n          min-width: 0;\n        }\n\n        .panelicon {\n          width: 40px;\n          height: 40px;\n          min-width: 40px;\n          border-radius: 14px;\n          display: grid;\n          place-items: center;\n          background: var(--ed-input-bg);\n          border: 1px solid var(--ed-input-border);\n          box-shadow: var(--ed-section-glow);\n        }\n\n        .panelicon .cgc-svg-icon {\n          color: var(--ed-text);\n        }\n\n        .panelhead-copy {\n          min-width: 0;\n          display: grid;\n          gap: 4px;\n        }\n\n        .paneltitle {\n          font-size: 16px;\n          font-weight: 1000;\n          color: var(--ed-text);\n          line-height: 1.2;\n        }\n\n        .panelsubtitle {\n          font-size: 12px;\n          color: var(--ed-text2);\n          line-height: 1.45;\n        }\n\n        .row {\n          display: grid;\n          gap: 12px;\n          padding: 16px;\n          border-radius: var(--ed-radius-row);\n          background: var(--ed-row-bg);\n          border: 1px solid var(--ed-row-border);\n          color: var(--ed-text);\n          min-width: 0;\n          transition:\n            background 0.18s ease,\n            border-color 0.18s ease,\n            box-shadow 0.18s ease;\n        }\n\n        .row:hover {\n          border-color: var(--ed-row-border);\n        }\n\n        .row-disabled {\n          opacity: 0.6;\n        }\n\n        .row-disabled .lbl {\n          color: var(--ed-text2);\n        }\n\n        .row-head {\n          display: flex;\n          align-items: flex-start;\n          justify-content: space-between;\n          gap: 12px;\n          min-width: 0;\n        }\n\n        .row-head > :first-child {\n          min-width: 0;\n          flex: 1 1 auto;\n          display: grid;\n          gap: 6px;\n        }\n\n        .row-inline {\n          display: flex;\n          align-items: center;\n          justify-content: space-between;\n          gap: 16px;\n        }\n\n        .row-inline .lbl {\n          margin: 0;\n        }\n\n        .row-inline #bgcolor-host {\n          display: flex;\n          align-items: center;\n          flex: 0 0 auto;\n        }\n\n        #bgcolor {\n          width: 42px;\n          height: 28px;\n          padding: 0;\n          border: 1px solid var(--ed-input-border);\n          border-radius: 6px;\n          background: none;\n          cursor: pointer;\n          appearance: none;\n          -webkit-appearance: none;\n        }\n\n        #bgcolor::-webkit-color-swatch-wrapper {\n          padding: 0;\n        }\n\n        #bgcolor::-webkit-color-swatch {\n          border: none;\n          border-radius: 6px;\n        }\n\n        .lbl {\n          font-size: 13px;\n          font-weight: 950;\n          color: var(--ed-text);\n          line-height: 1.2;\n          letter-spacing: 0.01em;\n        }\n\n        .desc {\n          font-size: 12px;\n          opacity: 0.88;\n          color: var(--ed-text2);\n          line-height: 1.45;\n        }\n\n        code {\n          opacity: 0.95;\n        }\n\n        .cgc-range {\n          width: 100%;\n          cursor: pointer;\n          accent-color: var(--primary-color, #03a9f4);\n          height: 4px;\n          -webkit-appearance: none;\n          appearance: none;\n          border-radius: 2px;\n          background: color-mix(in srgb, var(--primary-color, #03a9f4) 30%, var(--divider-color, #e0e0e0));\n          outline: none;\n        }\n        .cgc-range::-webkit-slider-thumb {\n          -webkit-appearance: none;\n          width: 18px;\n          height: 18px;\n          border-radius: 50%;\n          background: var(--primary-color, #03a9f4);\n          box-shadow: 0 1px 3px rgba(0,0,0,0.3);\n          cursor: pointer;\n        }\n        .cgc-range:disabled { opacity: 0.45; cursor: not-allowed; }\n        .cgc-switch { display: inline-flex; align-items: center; cursor: pointer; flex-shrink: 0; }\n        .cgc-switch input { position: absolute; opacity: 0; width: 0; height: 0; }\n        .cgc-track { width: 36px; height: 20px; border-radius: 10px; background: var(--switch-unchecked-track-color, rgba(0,0,0,0.26)); position: relative; transition: background 0.2s; flex-shrink: 0; }\n        .cgc-track::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }\n        .cgc-switch input:checked + .cgc-track { background: var(--switch-checked-track-color, var(--primary-color, #03a9f4)); }\n        .cgc-switch input:checked + .cgc-track::after { transform: translateX(16px); }\n        .cgc-switch input:disabled + .cgc-track { opacity: 0.45; cursor: not-allowed; }\n\n        .field {\n          position: relative;\n          min-width: 0;\n        }\n\n        .field textarea {\n          width: 100%;\n          box-sizing: border-box;\n          border-radius: var(--ed-radius-input);\n          border: 1px solid var(--ed-input-border);\n          background: var(--ed-input-bg);\n          color: var(--ed-text);\n          padding: 13px 14px;\n          font-size: 13px;\n          font-weight: 800;\n          outline: none;\n          resize: vertical;\n          min-height: 112px;\n          line-height: 1.45;\n          white-space: pre-wrap;\n          font-family:\n            ui-monospace,\n            SFMono-Regular,\n            Menlo,\n            Monaco,\n            Consolas,\n            "Liberation Mono",\n            "Courier New",\n            monospace;\n          transition:\n            border-color 0.16s ease,\n            box-shadow 0.16s ease,\n            background 0.16s ease;\n          box-shadow: var(--ed-section-glow);\n        }\n\n        #stylevars {\n          font-weight: 500;\n          cursor: text;\n          user-select: text;\n          -webkit-user-select: text;\n          line-height: 1.5;\n        }\n\n        .field textarea::placeholder {\n          color: color-mix(in srgb, var(--ed-text2) 82%, transparent);\n        }\n\n        .field textarea:focus {\n          border-color: color-mix(\n            in srgb,\n            var(--ed-input-border) 25%,\n            var(--primary-color, #03a9f4) 75%\n          );\n          box-shadow:\n            0 0 0 3px var(--ed-focus-ring),\n            var(--ed-section-glow);\n        }\n\n        .field textarea:disabled {\n          opacity: 0.65;\n          cursor: not-allowed;\n        }\n\n        .field.valid textarea {\n          border-color: var(--ed-valid);\n        }\n\n        .field.invalid textarea {\n          border-color: var(--ed-invalid);\n        }\n\n        .suggestions {\n          position: absolute;\n          left: 0;\n          right: 0;\n          top: calc(100% + 8px);\n          background: var(--ed-sugg-bg);\n          border: 1px solid var(--ed-sugg-border);\n          border-radius: 14px;\n          box-shadow: var(--ed-shadow-float);\n          padding: 8px;\n          display: grid;\n          gap: 4px;\n          z-index: 999;\n          max-height: 280px;\n          overflow: auto;\n          backdrop-filter: blur(10px);\n          -webkit-backdrop-filter: blur(10px);\n        }\n\n        .suggestions[hidden] {\n          display: none;\n        }\n\n        .sugg-label {\n          padding: 6px 10px 8px;\n          font-size: 11px;\n          font-weight: 900;\n          letter-spacing: 0.04em;\n          text-transform: uppercase;\n          color: var(--ed-text2);\n        }\n\n        .sugg-item {\n          appearance: none;\n          -webkit-appearance: none;\n          border: 0;\n          background: transparent;\n          color: var(--ed-text);\n          text-align: left;\n          padding: 11px 12px;\n          border-radius: 10px;\n          cursor: pointer;\n          font-size: 12px;\n          font-weight: 800;\n          font-family:\n            ui-monospace,\n            SFMono-Regular,\n            Menlo,\n            Monaco,\n            Consolas,\n            "Liberation Mono",\n            "Courier New",\n            monospace;\n          white-space: normal;\n          overflow: visible;\n          text-overflow: clip;\n          word-break: break-word;\n          overflow-wrap: anywhere;\n          line-height: 1.35;\n          transition:\n            background 0.14s ease,\n            transform 0.14s ease;\n        }\n\n        .sugg-item:hover {\n          background: var(--ed-sugg-hover);\n        }\n\n        .sugg-item.active {\n          background: var(--ed-sugg-active);\n        }\n\n        .sugg-active-path {\n          padding: 9px 10px 4px;\n          font-size: 11px;\n          opacity: 0.75;\n          word-break: break-word;\n          overflow-wrap: anywhere;\n          border-top: 1px solid var(--ed-sugg-border);\n          margin-top: 4px;\n          color: var(--ed-text2);\n        }\n\n        .selectwrap {\n          position: relative;\n          min-width: 0;\n        }\n\n        .select {\n          width: 100%;\n          box-sizing: border-box;\n          border-radius: var(--ed-radius-input);\n          border: 1px solid var(--ed-select-border);\n          background: var(--ed-select-bg);\n          color: var(--ed-text);\n          padding: 12px 42px 12px 14px;\n          font-size: 13px;\n          font-weight: 800;\n          outline: none;\n          min-width: 0;\n          appearance: none;\n          -webkit-appearance: none;\n          cursor: pointer;\n          transition:\n            border-color 0.16s ease,\n            box-shadow 0.16s ease,\n            background 0.16s ease;\n          box-shadow: var(--ed-section-glow);\n        }\n\n        .select:hover {\n          border-color: color-mix(\n            in srgb,\n            var(--ed-select-border) 70%,\n            var(--ed-text2) 30%\n          );\n        }\n\n        .color-grid {\n          display: grid;\n          gap: 10px;\n        }\n\n        .color-row {\n          display: grid;\n          grid-template-columns: 1fr auto;\n          align-items: center;\n          gap: 12px;\n        }\n\n        .color-controls {\n          display: flex;\n          align-items: center;\n          gap: 8px;\n        }\n\n        .color-row .lbl {\n          margin: 0;\n        }\n\n        .color-reset {\n          appearance: none;\n          border: none;\n          background: none;\n          padding: 0;\n          margin-left: 4px;\n          width: 20px;\n          height: 20px;\n          display: grid;\n          place-items: center;\n          cursor: pointer;\n          color: var(--ed-text2);\n          opacity: 0.7;\n          transition:\n            opacity 0.15s ease,\n            transform 0.15s ease,\n            color 0.15s ease;\n        }\n\n        .color-reset:hover {\n          opacity: 1;\n          border-color: var(--ed-tab-border);\n          color: var(--ed-text);\n        }\n\n        .color-reset .cgc-svg-icon { display: block; }\n\n        .select:focus {\n          border-color: color-mix(\n            in srgb,\n            var(--ed-select-border) 25%,\n            var(--primary-color, #03a9f4) 75%\n          );\n          box-shadow:\n            0 0 0 3px var(--ed-focus-ring),\n            var(--ed-section-glow);\n        }\n\n        .select:disabled {\n          opacity: 0.65;\n          cursor: not-allowed;\n        }\n\n        .selarrow {\n          position: absolute;\n          top: 50%;\n          right: 16px;\n          width: 10px;\n          height: 10px;\n          transform: translateY(-60%) rotate(45deg);\n          border-right: 2px solid var(--ed-arrow);\n          border-bottom: 2px solid var(--ed-arrow);\n          pointer-events: none;\n          opacity: 0.9;\n        }\n\n        .select.invalid {\n          border-color: var(--ed-invalid);\n        }\n\n        .segwrap {\n          display: flex;\n          gap: 8px;\n        }\n\n        .seg {\n          flex: 1;\n          border: 1px solid var(--ed-seg-border);\n          background: var(--ed-seg-bg);\n          color: var(--ed-seg-txt);\n          border-radius: 12px;\n          padding: 11px 0;\n          font-size: 13px;\n          font-weight: 850;\n          cursor: pointer;\n          min-width: 0;\n          transition:\n            background 0.16s ease,\n            border-color 0.16s ease,\n            color 0.16s ease,\n            transform 0.16s ease,\n            box-shadow 0.16s ease;\n        }\n\n        .seg:hover {\n          border-color: var(--ed-tab-border);\n        }\n\n        .seg.on {\n          background: var(--ed-seg-on-bg);\n          color: var(--ed-seg-on-txt);\n          border-color: transparent;\n          box-shadow: var(--ed-shadow-press);\n        }\n\n        .togrow {\n          display: flex;\n          align-items: center;\n          justify-content: flex-end;\n          gap: 12px;\n          min-width: 0;\n          flex: 0 0 auto;\n          white-space: nowrap;\n        }\n\n        .barrow {\n          display: grid;\n          gap: 10px;\n          min-width: 0;\n        }\n\n        .barrow-top {\n          display: flex;\n          align-items: center;\n          justify-content: space-between;\n          gap: 12px;\n        }\n\n        .pillval {\n          min-width: 56px;\n          text-align: center;\n          padding: 6px 10px;\n          border-radius: var(--ed-radius-pill);\n          background: var(--ed-pill-bg);\n          border: 1px solid var(--ed-pill-border);\n          font-size: 12px;\n          font-weight: 1000;\n          color: var(--ed-pill-txt);\n          box-shadow: var(--ed-section-glow);\n        }\n\n        .muted {\n          opacity: var(--ed-muted);\n        }\n\n        .hint {\n          margin: 2px 0 0 0;\n          font-size: 12px;\n          opacity: 0.92;\n          color: var(--ed-text2);\n          display: flex;\n          align-items: center;\n          gap: 8px;\n          flex-wrap: wrap;\n        }\n\n        .hint .cgc-svg-icon {\n          color: var(--ed-text2);\n          flex-shrink: 0;\n        }\n\n        .hint a {\n          color: var(--primary-color);\n          text-decoration: none;\n          font-weight: 700;\n        }\n\n        .hint a:hover {\n          text-decoration: underline;\n        }\n\n        .row-actions {\n          display: flex;\n          gap: 10px;\n          margin-top: 10px;\n        }\n\n        .row-actions .actionbtn {\n          flex: 1;\n          justify-content: center;\n        }\n\n        .actionbtn {\n          appearance: none;\n          -webkit-appearance: none;\n          border: 1px solid var(--ed-input-border);\n          background: var(--ed-input-bg);\n          color: var(--ed-text);\n          border-radius: 12px;\n          min-height: 40px;\n          padding: 0 14px;\n          cursor: pointer;\n          display: inline-flex;\n          align-items: center;\n          gap: 8px;\n          font-size: 13px;\n          font-weight: 900;\n          transition:\n            background 0.18s ease,\n            border-color 0.18s ease,\n            transform 0.18s ease,\n            box-shadow 0.18s ease;\n        }\n\n        .actionbtn:hover {\n          border-color: color-mix(\n            in srgb,\n            var(--ed-input-border) 65%,\n            var(--ed-text2) 35%\n          );\n        }\n\n        .actionbtn:disabled {\n          opacity: 0.65;\n          cursor: not-allowed;\n          transform: none;\n        }\n\n        .actionbtn .cgc-svg-icon { flex-shrink: 0; }\n\n        .livecam-tags {\n          display: flex;\n          flex-direction: column;\n          gap: 6px;\n          margin-top: 6px;\n        }\n        .livecam-tag {\n          display: flex;\n          align-items: center;\n          gap: 4px;\n          padding: 4px 4px 4px 4px;\n          background: var(--ed-chip-bg);\n          border: 1px solid var(--ed-chip-border);\n          border-radius: 999px;\n          font-size: 12px;\n          color: var(--ed-text);\n          cursor: grab;\n          transition: opacity 0.15s, box-shadow 0.15s;\n        }\n        .livecam-tag.dnd-dragging { opacity: 0.35; }\n        .livecam-tag.dnd-over { box-shadow: -3px 0 0 0 var(--primary-color, #03a9f4); }\n        .livecam-tag-grip {\n          font-size: 18px; opacity: 0.4; line-height: 1;\n          cursor: grab; user-select: none;\n          padding: 4px 4px 4px 2px; margin: -4px 0;\n          touch-action: none;\n        }\n        .livecam-tag-num {\n          font-size: 10px; font-weight: 700; opacity: 0.5;\n          background: var(--ed-text2, #888); color: var(--ed-bg, #fff);\n          border-radius: 999px; min-width: 16px; height: 16px;\n          display: flex; align-items: center; justify-content: center;\n          padding: 0 4px; line-height: 1;\n        }\n        .livecam-tag-entity {\n          opacity: 0.45;\n          font-size: 10px;\n          font-weight: 500;\n        }\n        .livecam-tag-del {\n          border: none;\n          background: none;\n          cursor: pointer;\n          color: var(--ed-text2);\n          padding: 0 2px;\n          font-size: 15px;\n          line-height: 1;\n        }\n\n        .menubtn-list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }\n        .menubtn-card {\n          border: 1px solid var(--ed-input-border);\n          border-radius: var(--ed-radius-input, 8px);\n          padding: 8px 10px;\n        }\n        .menubtn-card-header {\n          display: flex;\n          align-items: center;\n          gap: 8px;\n          margin-bottom: 8px;\n        }\n        .menubtn-fields {\n          display: grid;\n          grid-template-columns: 1fr 1fr;\n          gap: 6px;\n        }\n        .menubtn-fields > div { display: flex; flex-direction: column; gap: 3px; }\n\n        .chip-grid {\n          display: grid;\n          grid-template-columns: repeat(2, minmax(0, 1fr));\n          gap: 10px;\n          margin-top: 4px;\n        }\n\n        .objchip {\n          display: grid;\n          grid-template-columns: 36px 1fr auto;\n          align-items: center;\n          column-gap: 10px;\n          width: 100%;\n          min-height: 44px;\n          padding: 0 10px;\n          border-radius: 12px;\n          border: 1px solid var(--ed-chip-border);\n          background: var(--ed-chip-bg);\n          color: var(--ed-chip-txt);\n          cursor: pointer;\n          transition:\n            background 0.18s ease,\n            border-color 0.18s ease,\n            color 0.18s ease,\n            box-shadow 0.18s ease;\n          box-sizing: border-box;\n          box-shadow: var(--ed-section-glow);\n        }\n\n        .objchip:hover {\n          border-color: var(--ed-tab-border);\n        }\n\n        .objchip.on {\n          background: var(--ed-chip-on-bg);\n          border-color: var(--ed-chip-on-border);\n          color: var(--ed-chip-on-txt);\n          box-shadow: var(--ed-shadow-chip);\n        }\n\n        .objchip.disabled {\n          opacity: var(--ed-chip-disabled);\n          cursor: not-allowed;\n          transform: none;\n        }\n\n        .objchip-icon {\n          width: 36px;\n          height: 36px;\n          min-width: 36px;\n          border-radius: 999px;\n          display: grid;\n          place-items: center;\n          background: var(--ed-chip-icon-bg);\n          transition: background 0.18s ease;\n        }\n\n        .objchip.on .objchip-icon {\n          background: var(--ed-chip-on-icon-bg);\n          color: inherit;\n        }\n\n        .objchip-icon .cgc-svg-icon {\n          color: inherit;\n        }\n\n        .objchip-label {\n          min-width: 0;\n          overflow: hidden;\n          text-overflow: ellipsis;\n          white-space: nowrap;\n          color: inherit;\n        }\n\n        .objchip-check {\n          display: none;\n        }\n\n        .objchip-native-check {\n          appearance: none;\n          -webkit-appearance: none;\n          width: 16px;\n          height: 16px;\n          min-width: 16px;\n          border: 2px solid var(--ed-chip-border);\n          border-radius: 4px;\n          background: transparent;\n          pointer-events: none;\n          justify-self: end;\n          transition: background 0.15s, border-color 0.15s;\n          position: relative;\n          flex-shrink: 0;\n        }\n        .objchip-native-check:checked {\n          background: var(--primary-color, #03a9f4);\n          border-color: var(--primary-color, #03a9f4);\n        }\n        .objchip-native-check:checked::after {\n          content: '';\n          position: absolute;\n          top: 1px; left: 4px;\n          width: 5px; height: 9px;\n          border: 2px solid #fff;\n          border-top: none; border-left: none;\n          transform: rotate(45deg);\n        }\n\n        /* Nieuwe styles voor custom filters */\n        .custom-filter-add {\n          display: flex;\n          flex-direction: column;\n          gap: 8px;\n          margin-top: 16px;\n        }\n\n        .custom-filter-add .ed-input {\n          flex: none;\n          width: 100%;\n        }\n\n        .custom-filter-add #new-filter-icon { width: 100%; }\n\n        .custom-filter-add .actionbtn {\n          width: 100%;\n          justify-content: center;\n        }\n\n        .custom-filter-list {\n          display: flex;\n          flex-direction: column;\n          gap: 4px;\n          margin-top: 12px;\n        }\n\n        .custom-item {\n          display: flex;\n          align-items: center;\n          justify-content: space-between;\n          padding: 4px 8px 4px 12px;\n          background: var(--ed-row-bg);\n          border: 1px solid var(--ed-row-border);\n          border-radius: 10px;\n          min-height: 48px;\n        }\n\n        .custom-item-info {\n          display: flex;\n          align-items: center;\n          gap: 12px;\n          font-size: 14px;\n          font-weight: 500;\n          color: var(--ed-text);\n        }\n\n        .custom-item-info ha-icon,\n        .custom-item-info .cgc-svg-icon {\n          color: var(--primary-color);\n        }\n\n        .remove-btn {\n          color: var(--ed-invalid);\n          cursor: pointer;\n          background: none;\n          border: none;\n          padding: 8px;\n          border-radius: 50%;\n          display: flex;\n          align-items: center;\n          justify-content: center;\n          flex-shrink: 0;\n        }\n\n        .remove-btn:hover {\n          background: color-mix(in srgb, var(--ed-invalid) 12%, transparent);\n        }\n\n        .remove-btn .cgc-svg-icon { display: block; }\n\n\n        .objchip-color {\n          display: flex;\n          align-items: center;\n          justify-self: center;\n          gap: 4px;\n        }\n\n        .objchip-color .cgc-color {\n          width: 26px;\n          height: 22px;\n          min-width: 26px;\n          flex: 0 0 26px;\n        }\n\n        .objchip-color .color-reset {\n          width: 16px;\n          height: 16px;\n          margin-left: 0;\n        }\n\n        .objchip-color .color-reset .cgc-svg-icon { display: block; }\n\n        .cgc-color {\n          width: 42px;\n          height: 28px;\n          min-width: 42px;\n          flex: 0 0 42px;\n          padding: 0;\n          border: 1px solid var(--ed-input-border);\n          border-radius: 6px;\n          background: none;\n          cursor: pointer;\n          appearance: none;\n          -webkit-appearance: none;\n          position: relative;\n          z-index: 2;\n        }\n\n        .cgc-color:disabled {\n          opacity: 0.35;\n          cursor: not-allowed;\n        }\n\n        .cgc-color::-webkit-color-swatch-wrapper {\n          padding: 0;\n        }\n\n        .cgc-color::-webkit-color-swatch {\n          border: none;\n          border-radius: 6px;\n        }\n\n        .subrows {\n          display: flex;\n          flex-direction: column;\n          gap: 8px;\n          margin-top: 8px;\n        }\n\n        .lbl.sub {\n          font-size: 14px;\n          font-weight: 500;\n          opacity: 0.95;\n        }\n\n        .objmeta {\n          display: flex;\n          align-items: center;\n          justify-content: space-between;\n          gap: 10px;\n          flex-wrap: wrap;\n          margin-top: 2px;\n        }\n\n        .countpill {\n          display: inline-flex;\n          align-items: center;\n          gap: 6px;\n          padding: 6px 10px;\n          border-radius: var(--ed-radius-pill);\n          background: var(--ed-input-bg);\n          border: 1px solid var(--ed-input-border);\n          color: var(--ed-text);\n          font-size: 11px;\n          font-weight: 950;\n          letter-spacing: 0.02em;\n        }\n\n        .browser-backdrop {\n          position: fixed;\n          inset: 0;\n          background: var(--ed-backdrop);\n          backdrop-filter: blur(10px) saturate(120%);\n          -webkit-backdrop-filter: blur(10px) saturate(120%);\n          z-index: 9998;\n        }\n\n        .browser-modal {\n          position: fixed;\n          left: 50%;\n          top: 50%;\n          transform: translate(-50%, -50%);\n          width: min(92vw, 760px);\n          max-height: min(84vh, 760px);\n          background: var(--card-background-color, #fff);\n          color: var(--ed-text);\n          border: 1px solid var(--ed-sugg-border);\n          border-radius: 20px;\n          box-shadow: var(--ed-shadow-modal);\n          z-index: 9999;\n          display: grid;\n          grid-template-rows: auto auto minmax(0, 1fr);\n          overflow: hidden;\n        }\n\n        .browser-head {\n          display: flex;\n          align-items: flex-start;\n          justify-content: space-between;\n          gap: 14px;\n          padding: 18px 18px 14px;\n          border-bottom: 1px solid var(--ed-row-border);\n        }\n\n        .browser-head-copy {\n          min-width: 0;\n          display: grid;\n          gap: 6px;\n        }\n\n        .browser-title {\n          font-size: 16px;\n          font-weight: 1000;\n          line-height: 1.2;\n        }\n\n        .browser-path {\n          font-size: 12px;\n          color: var(--ed-text2);\n          line-height: 1.45;\n          word-break: break-word;\n          overflow-wrap: anywhere;\n        }\n\n        .browser-iconbtn {\n          appearance: none;\n          -webkit-appearance: none;\n          width: 38px;\n          height: 38px;\n          min-width: 38px;\n          border-radius: 12px;\n          border: 1px solid var(--ed-input-border);\n          background: var(--ed-input-bg);\n          color: var(--ed-text);\n          display: grid;\n          place-items: center;\n          cursor: pointer;\n        }\n\n        .browser-iconbtn .cgc-svg-icon { display: block; }\n\n        .browser-toolbar {\n          display: flex;\n          align-items: center;\n          justify-content: space-between;\n          gap: 10px;\n          padding: 14px 18px;\n          border-bottom: 1px solid var(--ed-row-border);\n          flex-wrap: wrap;\n        }\n\n        .browser-btn {\n          appearance: none;\n          -webkit-appearance: none;\n          border: 1px solid var(--ed-input-border);\n          background: var(--ed-input-bg);\n          color: var(--ed-text);\n          border-radius: 12px;\n          min-height: 40px;\n          padding: 0 14px;\n          cursor: pointer;\n          display: inline-flex;\n          align-items: center;\n          gap: 8px;\n          font-size: 13px;\n          font-weight: 900;\n        }\n\n        .browser-btn.primary {\n          background: var(--ed-seg-on-bg);\n          color: var(--ed-seg-on-txt);\n          border-color: transparent;\n        }\n\n        .browser-btn.disabled,\n        .browser-btn:disabled {\n          opacity: 0.45;\n          cursor: default;\n        }\n\n        .browser-btn .cgc-svg-icon { flex-shrink: 0; }\n\n        .browser-body {\n          min-height: 0;\n          overflow: auto;\n          padding: 14px 18px 18px;\n          overscroll-behavior: contain;\n        }\n\n        .browser-list {\n          display: grid;\n          gap: 10px;\n        }\n\n        .browser-item {\n          display: grid;\n          grid-template-columns: minmax(0, 1fr) auto;\n          gap: 10px;\n          align-items: center;\n          padding: 10px;\n          border-radius: 16px;\n          background: var(--ed-row-bg);\n          border: 1px solid var(--ed-row-border);\n        }\n\n        .browser-open {\n          appearance: none;\n          -webkit-appearance: none;\n          border: 0;\n          background: transparent;\n          color: var(--ed-text);\n          text-align: left;\n          min-width: 0;\n          padding: 0;\n          cursor: pointer;\n          display: grid;\n          grid-template-columns: 40px minmax(0, 1fr);\n          gap: 12px;\n          align-items: center;\n        }\n\n        .browser-open-icon {\n          width: 40px;\n          height: 40px;\n          border-radius: 12px;\n          display: grid;\n          place-items: center;\n          background: var(--ed-input-bg);\n          border: 1px solid var(--ed-input-border);\n        }\n\n        .browser-open-icon .cgc-svg-icon { display: block; }\n\n        .browser-open-copy {\n          min-width: 0;\n          display: grid;\n          gap: 4px;\n        }\n\n        .hint-block {\n          display: grid;\n          gap: 8px;\n          align-items: start;\n        }\n\n        .hint-title {\n          display: flex;\n          align-items: center;\n          gap: 8px;\n          font-size: 12px;\n          color: var(--ed-text2);\n        }\n\n        .vars-list {\n          display: grid;\n          gap: 6px;\n          padding-left: 22px;\n        }\n\n        .vars-list div {\n          display: flex;\n          flex-wrap: wrap;\n          gap: 8px;\n          line-height: 1.45;\n        }\n\n        .vars-list code {\n          opacity: 1;\n        }\n\n        .vars-list span {\n          color: var(--ed-text2);\n        }\n\n        .browser-open-title {\n          font-size: 13px;\n          font-weight: 950;\n          color: var(--ed-text);\n          overflow: hidden;\n          text-overflow: ellipsis;\n          white-space: nowrap;\n        }\n\n        .browser-open-sub {\n          font-size: 11px;\n          color: var(--ed-text2);\n          line-height: 1.35;\n          word-break: break-word;\n          overflow-wrap: anywhere;\n        }\n\n        .browser-select {\n          appearance: none;\n          -webkit-appearance: none;\n          border: 1px solid var(--ed-input-border);\n          background: var(--ed-input-bg);\n          color: var(--ed-text);\n          border-radius: 12px;\n          min-height: 38px;\n          padding: 0 12px;\n          cursor: pointer;\n          font-size: 12px;\n          font-weight: 900;\n          white-space: nowrap;\n        }\n\n        .color-transparent {\n          display: flex;\n          align-items: center;\n          gap: 6px;\n          font-size: 11px;\n          font-weight: 800;\n          color: var(--ed-text2);\n          cursor: pointer;\n        }\n\n        .color-transparent input {\n          cursor: pointer;\n        }\n\n        .style-sections {\n          display: grid;\n          gap: 8px;\n        }\n\n        .style-section {\n          border: 1px solid var(--ed-row-border);\n          border-radius: 12px;\n          overflow: hidden;\n          background: var(--ed-row-bg);\n        }\n\n        .style-section-head {\n          display: flex;\n          align-items: center;\n          gap: 10px;\n          padding: 12px 14px;\n          cursor: pointer;\n          list-style: none;\n          font-size: 13px;\n          font-weight: 800;\n          color: var(--ed-text);\n          user-select: none;\n        }\n\n        .style-section-head::-webkit-details-marker { display: none; }\n\n        .style-section-head .cgc-svg-icon:first-child {\n          color: var(--ed-text2);\n          flex: 0 0 auto;\n        }\n\n        .style-section-head > span:not(.style-chevron) {\n          flex: 1 1 auto;\n        }\n\n        .style-chevron {\n          color: var(--ed-text2);\n          flex: 0 0 auto;\n          margin-left: auto;\n          transition: transform 0.2s ease;\n          display: flex;\n          align-items: center;\n        }\n\n        details[open] .style-chevron {\n          transform: rotate(180deg);\n        }\n\n        .style-section-body {\n          padding: 4px 14px 14px;\n          border-top: 1px solid var(--ed-row-border);\n        }\n\n        .radius-range {\n          width: 90px;\n          cursor: pointer;\n          accent-color: var(--primary-color, #03a9f4);\n        }\n\n        .radius-value {\n          font-size: 12px;\n          font-weight: 800;\n          color: var(--ed-text2);\n          min-width: 34px;\n          text-align: right;\n        }\n\n        .browser-empty {\n          display: grid;\n          place-items: center;\n          min-height: 180px;\n          font-size: 13px;\n          font-weight: 800;\n          color: var(--ed-text2);\n          text-align: center;\n          padding: 20px;\n        }\n\n        @media (max-width: 900px) {\n          .tabbar {\n            grid-template-columns: repeat(2, minmax(0, 1fr));\n          }\n        }\n\n        @media (max-width: 640px) {\n          .row-head {\n            align-items: stretch;\n            flex-direction: column;\n          }\n\n          .togrow {\n            justify-content: space-between;\n            width: 100%;\n          }\n\n          .panelhead {\n            gap: 12px;\n          }\n\n          .panelicon {\n            width: 38px;\n            height: 38px;\n            min-width: 38px;\n          }\n\n          .browser-modal {\n            width: min(96vw, 760px);\n            max-height: min(88vh, 760px);\n          }\n\n          .browser-item {\n            grid-template-columns: 1fr;\n          }\n\n          .browser-select {\n            width: 100%;\n          }\n\n\n        }\n\n        .cgc-wizard { margin-top: 8px; }\n        .cgc-wizard-toggle {\n          width: 100%; text-align: left; background: none;\n          border: 1px dashed var(--divider-color, #555);\n          color: var(--secondary-text-color); border-radius: 6px;\n          padding: 5px 10px; cursor: pointer; font-size: 12px;\n        }\n        .cgc-wizard-toggle:hover { border-color: var(--primary-color); color: var(--primary-color); }\n        .cgc-wizard-body { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }\n        .cgc-wizard-row { display: flex; flex-direction: column; gap: 2px; }\n        .cgc-wizard-row label { font-size: 12px; font-weight: 500; }\n        .cgc-wizard-hint { font-size: 11px; color: var(--secondary-text-color); }\n        .cgc-wizard-prefix { font-size: 13px; color: var(--ed-text); white-space: nowrap; }\n        .cgc-wizard-folder-row { display: flex; align-items: center; gap: 4px; }\n        .ed-input {\n          flex: 1;\n          height: 36px;\n          padding: 0 10px;\n          box-sizing: border-box;\n          font-size: 13px;\n          font-family: inherit;\n          font-weight: 800;\n          color: var(--ed-text);\n          background: var(--ed-input-bg);\n          border: 1px solid var(--ed-input-border);\n          border-radius: var(--ed-radius-input);\n          outline: none;\n          width: 100%;\n          transition: border-color 0.16s ease, box-shadow 0.16s ease;\n          box-shadow: var(--ed-section-glow);\n        }\n        .ed-input:focus { border-color: color-mix(in srgb, var(--ed-input-border) 25%, var(--primary-color, #03a9f4) 75%); box-shadow: 0 0 0 3px var(--ed-focus-ring), var(--ed-section-glow); }\ndetails summary { user-select: none; }\n        details summary .details-chevron { transition: transform 0.15s; margin-left: auto; }\n        details[open] summary .details-chevron { transform: rotate(90deg); }\n        .cgc-row-summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 6px; padding: 0; }\n        .cgc-row-summary::-webkit-details-marker { display: none; }\n        .cgc-row-body { padding-top: 8px; }\n        .ed-input-row { display: flex; align-items: center; gap: 6px; }\n        .ed-suffix { font-size: 12px; color: var(--ed-text2); white-space: nowrap; }\n        .cgc-wizard-btn {\n          background: var(--primary-color); color: white;\n          border: none; border-radius: 6px; padding: 6px 14px;\n          cursor: pointer; font-size: 13px; align-self: flex-start;\n        }\n        .cgc-wizard-btn:disabled { opacity: 0.5; cursor: not-allowed; }\n        .cgc-wizard-link {\n          font-size: 11px; color: var(--primary-color, #03a9f4);\n          text-decoration: none; opacity: 0.75; margin-left: 6px;\n        }\n        .cgc-wizard-link:hover { opacity: 1; text-decoration: underline; }\n        .cgc-wizard-success {\n          font-size: 12px; color: var(--success-color, #4caf50);\n          background: rgba(76,175,80,0.1); border-radius: 6px; padding: 8px;\n        }\n        .cgc-wizard-error {\n          font-size: 12px; color: var(--error-color, #f44336);\n          background: rgba(244,67,54,0.1); border-radius: 6px; padding: 8px;\n        }\n        .cgc-inline-warn {\n          font-size: 11.5px; color: var(--ed-warning, rgba(245,158,11,0.95));\n          background: var(--ed-warning-bg); border: 1px solid var(--ed-warning-border);\n          border-radius: 6px; padding: 6px 8px; margin-top: 6px;\n          display: flex; align-items: flex-start; gap: 6px;\n        }\n        .cgc-inline-warn .cgc-svg-icon { flex-shrink: 0; margin-top: 1px; }\n      </style>\n\n      <div class="wrap" style="${W}">\n        <div class="tabs">\n          <div class="tabbar">\n            ${U("general","General","mdi:cog-outline")}\n            ${U("viewer","Viewer","mdi:image-outline")}\n            ${U("live","Live","mdi:video-outline")}\n            ${U("thumbs","Thumbnails","mdi:view-grid-outline")}\n            ${U("styling","Styling","mdi:palette-outline")}\n          </div>\n\n          ${Y()}\n\n        </div>\n      </div>\n\n      <div id="cgc-browser-slot">${K}</div>\n    `,this.shadowRoot.querySelectorAll("[data-tab]").forEach(e=>{e.addEventListener("click",()=>this._setActiveTab(e.dataset.tab))}),this._editorRendered=!0;this._evtCtrl&&this._evtCtrl.abort(),this._evtCtrl=new AbortController;const Z={signal:this._evtCtrl.signal};this._initCollapsibleRows(Z);const X=e=>this.shadowRoot.getElementById(e),Q=X("add-filter-btn"),J=X("new-filter-name"),G=X("new-filter-icon"),ee=()=>{const e=J?.value.trim().toLowerCase(),t=G?.value.trim()||"mdi:magnify";if(!e)return;const i=this._normalizeObjectFilters(this._config.object_filters||[]),n={[e]:t};this._set("object_filters",[...i,n]),J&&(J.value=""),G&&(G.value="")};Q?.addEventListener("click",ee,Z),J?.addEventListener("keydown",e=>{"Enter"===e.key&&(e.preventDefault(),ee())}),this.shadowRoot.querySelectorAll("[data-remove-index]").forEach(e=>{e.addEventListener("click",()=>{const t=e.dataset.removeIndex,i=this._normalizeObjectFilters(this._config.object_filters||[]).filter(e=>"string"==typeof e?e!==t:Object.keys(e)[0]!==t);this._set("object_filters",i)})}),this.shadowRoot.querySelectorAll("[data-filtercolor]").forEach(e=>{e.addEventListener("click",e=>e.stopPropagation(),Z),e.addEventListener("change",t=>{t.stopPropagation();const i=e.dataset.filtercolor,n={...this._config.object_colors||{},[i]:t.target.value};this._set("object_colors",n)})});const te=X("entities"),ie=X("mediasources"),ne=X("filenamefmt"),se=X("folderfmt"),re=X("delservice"),oe=X("thumb"),ae=X("maxmedia"),le=X("barop"),he=X("barval"),pe=X("pillsize"),me=X("pillsizeval"),ge=X("thumbpct"),_e=X("thumbpctval"),ve=X("autoplay"),be=X("auto_muted"),we=X("live_auto_muted");this._setControlValue(te,c),this._setControlValue(ie,p),this._setControlValue(ne,m),this._setControlValue(se,g),this._setControlValue(oe,String(f)),this._setControlValue(ae,String(y)),this._setControlValue(le,T),this._setControlValue(pe,I),this._setControlValue(ge,P),ve&&(ve.checked=F),be&&(be.checked=H),we&&(we.checked=R),re&&(re.value=M),this._applyFieldValidation("entities"),this._applyFieldValidation("mediasources"),this._bindColorControls(Z),this._bindWizardEvents(Z),this.shadowRoot.querySelectorAll("[data-src]").forEach(e=>{e.addEventListener("click",()=>{const t=e.dataset.src;if("media"===t){const e={...this._config};delete e.delete_service,delete e.shell_command,delete e.allow_delete,delete e.allow_bulk_delete,delete e.delete_confirm,this._config=this._stripAlwaysTrueKeys(e)}this._set("source_mode",t)})});const xe=X("browse-media-folders");xe?.addEventListener("click",async()=>{await this._openMediaBrowser("")});const Se=X("clear-media-folders");Se?.addEventListener("click",()=>{const e=X("mediasources");e&&(e.value="");const t={...this._config};delete t.media_sources,delete t.media_source,this._config=this._stripAlwaysTrueKeys(t),this._fire(),this._applyFieldValidation("mediasources"),this._scheduleRender()});const ke=(e,t)=>{const i=X(e);i&&(i.addEventListener("focus",()=>{this._updateSuggestions(e)}),i.addEventListener("input",()=>{t(!1),this._applyFieldValidation(e),this._updateSuggestions(e)}),i.addEventListener("change",()=>{t(!0),this._applyFieldValidation(e),this._closeSuggestions(e)}),i.addEventListener("blur",()=>{setTimeout(()=>{const i=this.shadowRoot?.activeElement,n=this.shadowRoot?.getElementById(`${e}-suggestions`);i&&n&&n.contains(i)||(t(!0),this._applyFieldValidation(e),this._closeSuggestions(e))},120)}),i.addEventListener("keydown",t=>{const i=this._suggestState[e];return i?.open&&"ArrowDown"===t.key?(t.preventDefault(),void this._moveSuggestion(e,1)):i?.open&&"ArrowUp"===t.key?(t.preventDefault(),void this._moveSuggestion(e,-1)):i?.open&&"Tab"===t.key&&this._acceptSuggestion(e)?void t.preventDefault():i?.open&&"Escape"===t.key?(t.preventDefault(),void this._closeSuggestions(e)):void 0}))};ke("entities",this._commitEntities.bind(this)),ke("mediasources",this._commitMediaSources.bind(this)),this.shadowRoot.querySelectorAll("[data-objchip]").forEach(e=>{e.addEventListener("click",()=>{this._toggleObjectFilter(e.dataset.objchip)})});re?.addEventListener("change",()=>{const e=String(re?.value||"").trim();if(!e){const e={...this._config};return delete e.delete_service,delete e.preview_close_on_tap,this._config=this._stripAlwaysTrueKeys(e),this._fire(),void this._scheduleRender()}this._set("delete_service",e)},Z);const $e=(e,t,i,n=!1)=>{const s=String(t?.value??"").trim();if(""===s)return void(n?this._set(e,i):this._config=this._stripAlwaysTrueKeys({...this._config,[e]:i}));const r=Number(s),o=Number.isFinite(r)?r:i;n?this._set(e,o):this._config=this._stripAlwaysTrueKeys({...this._config,[e]:o})},Ae=(e=!1)=>{const t=String(ne?.value??"").trim();if(!t){const t={...this._config};return delete t.filename_datetime_format,this._config=this._stripAlwaysTrueKeys(t),void(e&&(this._fire(),this._scheduleRender()))}this._config=this._stripAlwaysTrueKeys({...this._config,filename_datetime_format:t}),e&&(this._fire(),this._scheduleRender())};ne?.addEventListener("input",()=>Ae(!1),Z),ne?.addEventListener("change",()=>Ae(!0),Z),ne?.addEventListener("blur",()=>Ae(!0),Z);const Ce=(e=!1)=>{const t=String(se?.value??"").trim(),i={...this._config};t?i.folder_datetime_format=t:delete i.folder_datetime_format,this._config=this._stripAlwaysTrueKeys(i),e&&(this._fire(),this._scheduleRender())};se?.addEventListener("input",()=>Ce(!1),Z),se?.addEventListener("change",()=>Ce(!0),Z),se?.addEventListener("blur",()=>Ce(!0),Z),this.shadowRoot.querySelectorAll(".seg[data-objfit]").forEach(e=>{e.addEventListener("click",()=>{this._set("object_fit",e.dataset.objfit),e.closest(".segwrap")?.querySelectorAll(".seg").forEach(t=>t.classList.toggle("on",t===e))})}),this.shadowRoot.querySelectorAll(".seg[data-ppos]").forEach(e=>{e.addEventListener("click",()=>{this._set("preview_position",e.dataset.ppos),e.closest(".segwrap")?.querySelectorAll(".seg").forEach(t=>t.classList.toggle("on",t===e))})}),this.shadowRoot.querySelectorAll(".seg[data-startmode]").forEach(e=>{e.addEventListener("click",()=>{this._set("start_mode",e.dataset.startmode),e.closest(".segwrap")?.querySelectorAll(".seg").forEach(t=>t.classList.toggle("on",t===e))})}),oe?.addEventListener("input",()=>$e("thumb_size",oe,140,!1)),oe?.addEventListener("change",()=>$e("thumb_size",oe,140,!0)),oe?.addEventListener("blur",()=>$e("thumb_size",oe,140,!0));const Le=(e=!1)=>{const t=String(ae?.value??"").trim();if(""===t)return void(e?this._set("max_media",1):this._config=this._stripAlwaysTrueKeys({...this._config,max_media:1}));const i=this._numInt(t,1),n=this._clampInt(i,1,500);e?this._set("max_media",n):this._config=this._stripAlwaysTrueKeys({...this._config,max_media:n})};ae?.addEventListener("input",()=>Le(!1),Z),ae?.addEventListener("change",()=>Le(!0),Z),ae?.addEventListener("blur",()=>Le(!0),Z),this.shadowRoot.querySelectorAll(".seg[data-tbpos]").forEach(e=>{e.addEventListener("click",()=>{this._set("thumb_bar_position",e.dataset.tbpos),e.closest(".segwrap")?.querySelectorAll(".seg").forEach(t=>t.classList.toggle("on",t===e))})}),this.shadowRoot.querySelectorAll(".seg[data-tlayout]").forEach(e=>{e.addEventListener("click",()=>{this._set("thumb_layout",e.dataset.tlayout),e.closest(".segwrap")?.querySelectorAll(".seg").forEach(t=>t.classList.toggle("on",t===e))})}),X("cleanmode")?.addEventListener("change",e=>{this._set("clean_mode",!!e.target.checked)}),X("persistentcontrols")?.addEventListener("change",e=>{this._set("persistent_controls",!!e.target.checked)}),this.shadowRoot.querySelectorAll(".seg[data-ctrlmode]").forEach(e=>{e.addEventListener("click",()=>{this._set("controls_mode",e.dataset.ctrlmode),e.closest(".segwrap")?.querySelectorAll(".seg").forEach(t=>t.classList.toggle("on",t===e))})}),X("showcameratitle")?.addEventListener("change",e=>{this._set("show_camera_title",!!e.target.checked)}),ve?.addEventListener("change",e=>{this._set("autoplay",!!e.target.checked)}),be?.addEventListener("change",e=>{this._set("auto_muted",!!e.target.checked)}),we?.addEventListener("change",e=>{this._set("live_auto_muted",!!e.target.checked)});const Me=X("stream-urls-list"),Ee=X("stream-url-add"),ze=()=>(Me?Array.from(Me.querySelectorAll(".stream-url-row")):[]).map(e=>{const t=e.dataset.si;return{url:String(Me.querySelector(`.stream-url-input[data-si="${t}"]`)?.value||"").trim(),name:String(Me.querySelector(`.stream-name-input[data-si="${t}"]`)?.value||"").trim()||null}}).filter(e=>e.url),Te=()=>{const e=ze(),t={...this._config};delete t.live_stream_url,delete t.live_stream_name,e.length>0?t.live_stream_urls=e:delete t.live_stream_urls,this._config=this._stripAlwaysTrueKeys(t),this._fire()},Pe=(e="",t="")=>{if(!Me)return;const i=Me.querySelectorAll(".stream-url-row").length,n=document.createElement("div");n.className="stream-url-row",n.dataset.si=i,n.style.cssText="display:flex;flex-direction:column;gap:4px;padding:8px 0 8px 0;border-bottom:1px solid var(--divider-color,#e0e0e0);",n.innerHTML=`\n        <div style="display:flex;gap:6px;align-items:center;">\n          <input type="text" class="ed-input stream-url-input" data-si="${i}" placeholder="rtsp://192.168.1.x:554/stream" autocomplete="off" value="${e.replace(/"/g,"&quot;")}" style="flex:1;" />\n          <button type="button" class="livecam-tag-del stream-url-del" data-si="${i}" style="flex-shrink:0;">×</button>\n        </div>\n        <input type="text" class="ed-input stream-name-input" data-si="${i}" placeholder="Name (e.g. Front door)" autocomplete="off" value="${t.replace(/"/g,"&quot;")}" />\n      `,n.querySelector(".stream-url-del").addEventListener("click",()=>{n.remove(),Te(),this._scheduleRender()}),n.querySelector(".stream-url-input").addEventListener("change",Te,Z),n.querySelector(".stream-name-input").addEventListener("change",Te,Z),Me.appendChild(n)};Me&&(Me.querySelectorAll(".stream-url-del").forEach(e=>{e.addEventListener("click",()=>{e.closest(".stream-url-row").remove(),Te(),this._scheduleRender()})}),Me.querySelectorAll(".stream-url-input, .stream-name-input").forEach(e=>{e.addEventListener("change",Te,Z)})),Ee?.addEventListener("click",()=>{Pe()}),X("live_go2rtc_stream")?.addEventListener("change",e=>{const t=String(e.target.value||"").trim();if(t)this._set("live_go2rtc_stream",t);else{const e={...this._config};delete e.live_go2rtc_stream,this._config=this._stripAlwaysTrueKeys(e),this._fire()}}),X("live_go2rtc_url")?.addEventListener("change",e=>{const t=String(e.target.value||"").trim();if(t)this._set("live_go2rtc_url",t);else{const e={...this._config};delete e.live_go2rtc_url,this._config=this._stripAlwaysTrueKeys(e),this._fire()}}),X("frigate_url")?.addEventListener("change",e=>{const t=String(e.target.value||"").trim().replace(/\/+$/,"");if(t)this._set("frigate_url",t);else{const e={...this._config};delete e.frigate_url,this._config=this._stripAlwaysTrueKeys(e),this._fire()}}),X("liveenabled")?.addEventListener("change",e=>{if(!!e.target.checked)return void this._set("live_enabled",!0);const t={...this._config};delete t.live_default,delete t.live_camera_entity,delete t.live_enabled,delete t.live_provider,this._config=this._stripAlwaysTrueKeys(t),this._fire(),this._scheduleRender()});const Fe=X("livedefault-input"),He=X("livedefault-suggestions");if(Fe&&He){const e=e=>{if(!e.length)return He.hidden=!0,void(He.innerHTML="");He.hidden=!1,He.innerHTML=`\n          <div class="sugg-label">Cameras</div>\n          ${e.map(({id:e,label:t,sub:i})=>`<button type="button" class="sugg-item" data-setdefcam="${e}">${t}<span style="opacity:0.45;font-weight:500;margin-left:6px;">${i}</span></button>`).join("")}\n        `,He.querySelectorAll("[data-setdefcam]").forEach(e=>{e.addEventListener("mousedown",i=>{i.preventDefault(),t(e.dataset.setdefcam)})})},t=e=>{e&&(this._set("live_camera_entity",e),Fe.value="",He.hidden=!0,He.innerHTML="",this._scheduleRender())},i=()=>{const e=Fe.value.trim().toLowerCase(),t=(()=>Array.isArray(this._config.live_stream_urls)&&this._config.live_stream_urls.length>0?this._config.live_stream_urls.filter(e=>e?.url):this._config.live_stream_url?[{url:this._config.live_stream_url,name:this._config.live_stream_name||"Stream"}]:[])(),i=t.map((e,t)=>({id:`__cgc_stream_${t}__`,label:e.name||`Stream ${t+1}`,sub:"stream url"}));return[...i,...q.map(e=>({id:e,label:String(this._hass?.states?.[e]?.attributes?.friendly_name||e).trim(),sub:e}))].filter(({label:t,sub:i})=>!e||(t.toLowerCase().includes(e)||i.toLowerCase().includes(e)))};Fe.addEventListener("focus",()=>e(i()),Z),Fe.addEventListener("input",()=>e(i()),Z),Fe.addEventListener("keydown",e=>{if("Enter"===e.key){e.preventDefault();const i=He.querySelector("[data-setdefcam]");i&&t(i.dataset.setdefcam)}else"Escape"===e.key&&(He.hidden=!0)}),Fe.addEventListener("blur",()=>{setTimeout(()=>{He.hidden=!0},150)})}const Re=X("livecam-input"),je=X("livecam-suggestions");if(Re&&je){const e=e=>{if(!e.length)return je.hidden=!0,void(je.innerHTML="");je.hidden=!1,je.innerHTML=`\n          <div class="sugg-label">Cameras</div>\n          ${e.map(e=>`<button type="button" class="sugg-item" data-addcam="${e}">${String(this._hass?.states?.[e]?.attributes?.friendly_name||e).trim()}<span style="opacity:0.45;font-weight:500;margin-left:6px;">${e}</span></button>`).join("")}\n        `,je.querySelectorAll("[data-addcam]").forEach(e=>{e.addEventListener("mousedown",i=>{i.preventDefault(),t(e.dataset.addcam)})})},t=e=>{if(!e)return;const t=Array.isArray(this._config.live_camera_entities)?[...this._config.live_camera_entities]:[];t.includes(e)||(t.push(e),this._set("live_camera_entities",t)),Re.value="",je.hidden=!0,je.innerHTML="",this._scheduleRender()},i=()=>{const e=Re.value.trim().toLowerCase(),t=Array.isArray(this._config.live_camera_entities)?this._config.live_camera_entities:[];return q.filter(i=>{if(t.includes(i))return!1;if(!e)return!0;return String(this._hass?.states?.[i]?.attributes?.friendly_name||i).toLowerCase().includes(e)||i.includes(e)})};Re.addEventListener("focus",()=>e(i()),Z),Re.addEventListener("input",()=>e(i()),Z),Re.addEventListener("keydown",e=>{if("Enter"===e.key){e.preventDefault();const i=je.querySelector("[data-addcam]");i&&t(i.dataset.addcam)}else"Escape"===e.key&&(je.hidden=!0)}),Re.addEventListener("blur",()=>{setTimeout(()=>{je.hidden=!0},150)})}this.shadowRoot.querySelectorAll("[data-deldefcam]").forEach(e=>{e.addEventListener("click",()=>{const e={...this._config};delete e.live_camera_entity,this._config=this._stripAlwaysTrueKeys(e),this._fire(),this._scheduleRender()})}),this.shadowRoot.querySelectorAll("[data-delcam]").forEach(e=>{e.addEventListener("click",()=>{const t=e.dataset.delcam,i=Array.isArray(this._config.live_camera_entities)?[...this._config.live_camera_entities]:[],n=i.indexOf(t);if(n>=0&&i.splice(n,1),0===i.length){const e={...this._config};delete e.live_camera_entities,this._config=e,this._fire()}else this._set("live_camera_entities",i);this._scheduleRender()})});const Ie=["mdi:lightbulb","mdi:lightbulb-outline","mdi:lightbulb-off","mdi:lightbulb-on","mdi:lamp","mdi:ceiling-light","mdi:floor-lamp","mdi:led-strip","mdi:string-lights","mdi:lock","mdi:lock-open","mdi:lock-outline","mdi:lock-open-outline","mdi:lock-smart","mdi:shield-home","mdi:shield","mdi:door-open","mdi:door-closed","mdi:window-open","mdi:window-closed","mdi:garage","mdi:garage-open","mdi:gate","mdi:gate-open","mdi:thermostat","mdi:thermometer","mdi:fan","mdi:fan-off","mdi:air-conditioner","mdi:radiator","mdi:snowflake","mdi:heat-wave","mdi:home","mdi:home-outline","mdi:home-away","mdi:sleep","mdi:run","mdi:power","mdi:power-off","mdi:toggle-switch","mdi:toggle-switch-off","mdi:electric-switch","mdi:outlet","mdi:television","mdi:television-off","mdi:play","mdi:pause","mdi:stop","mdi:volume-high","mdi:volume-off","mdi:music","mdi:speaker","mdi:camera","mdi:cctv","mdi:motion-sensor","mdi:motion-sensor-off","mdi:smoke-detector","mdi:bell","mdi:bell-off","mdi:alert","mdi:robot-vacuum","mdi:washing-machine","mdi:dishwasher","mdi:coffee","mdi:car","mdi:car-connected","mdi:ev-station","mdi:water","mdi:water-off","mdi:pool","mdi:sprinkler","mdi:blinds","mdi:blinds-open","mdi:curtains","mdi:curtains-closed","mdi:ceiling-fan","mdi:ceiling-fan-light","mdi:battery","mdi:battery-charging","mdi:wifi","mdi:bluetooth","mdi:account","mdi:account-outline","mdi:account-group","mdi:star","mdi:heart","mdi:check","mdi:close","mdi:plus","mdi:minus","mdi:pencil","mdi:delete","mdi:refresh","mdi:eye","mdi:eye-off","mdi:flash","mdi:flash-off","mdi:weather-sunny","mdi:weather-night","mdi:weather-cloudy","mdi:chart-line","mdi:information","mdi:cog","mdi:tools"],Ve=(e,t,i)=>{if(!e||!t)return;const n=e=>{const t=(e||"").toLowerCase().replace(/^mdi:/,""),i=Ie;return t?i.filter(e=>e.replace("mdi:","").includes(t)).slice(0,30):i.slice(0,30)},s=e=>{if(!e.length)return t.hidden=!0,void(t.innerHTML="");t.hidden=!1,t.innerHTML=e.map(e=>`<button type="button" class="sugg-item" data-pick-icon="${e}" style="display:flex;align-items:center;gap:8px;"><ha-icon icon="${e}" style="--mdc-icon-size:18px;flex-shrink:0;"></ha-icon><span>${e.replace("mdi:","")}</span></button>`).join(""),t.querySelectorAll("[data-pick-icon]").forEach(e=>{e.addEventListener("mousedown",t=>{t.preventDefault(),i(e.dataset.pickIcon)},Z)})};e.addEventListener("focus",()=>s(n(e.value)),Z),e.addEventListener("input",()=>s(n(e.value)),Z),e.addEventListener("keydown",e=>{if("Enter"===e.key){e.preventDefault();const n=t.querySelector("[data-pick-icon]");n&&i(n.dataset.pickIcon)}else"Escape"===e.key&&(t.hidden=!0)}),e.addEventListener("blur",()=>{setTimeout(()=>{t.hidden=!0},150)},Z)};this.shadowRoot.querySelectorAll("[data-delmenubutton]").forEach(e=>{e.addEventListener("click",()=>{const t=Number(e.dataset.delmenubutton),i=Array.isArray(this._config.menu_buttons)?[...this._config.menu_buttons]:[];i.splice(t,1),this._set("menu_buttons",i),this._scheduleRender()})});const Oe=Object.keys(this._hass?.states||{}).sort(),De=e=>{const t=e.toLowerCase();return Oe.filter(e=>{const i=String(this._hass?.states?.[e]?.attributes?.friendly_name||"").toLowerCase();return!t||e.includes(t)||i.includes(t)}).slice(0,30)},Be=(e,t,i)=>{if(!e||!t)return;const n=e=>{if(!e.length)return t.hidden=!0,void(t.innerHTML="");t.hidden=!1,t.innerHTML=e.map(e=>`<button type="button" class="sugg-item" data-pick-entity="${e}">${String(this._hass?.states?.[e]?.attributes?.friendly_name||e).trim()}<span style="opacity:0.45;font-weight:500;margin-left:6px;">${e}</span></button>`).join(""),t.querySelectorAll("[data-pick-entity]").forEach(e=>{e.addEventListener("mousedown",t=>{t.preventDefault(),i(e.dataset.pickEntity)},Z)})};e.addEventListener("focus",()=>n(De(e.value)),Z),e.addEventListener("input",()=>n(De(e.value)),Z),e.addEventListener("keydown",e=>{if("Enter"===e.key){e.preventDefault();const n=t.querySelector("[data-pick-entity]");n&&i(n.dataset.pickEntity)}else"Escape"===e.key&&(t.hidden=!0)}),e.addEventListener("blur",()=>{setTimeout(()=>{t.hidden=!0},150)},Z)};this.shadowRoot.querySelectorAll("input[data-menubtn-entity]").forEach(e=>{const t=Number(e.dataset.menubtnEntity),i=this.shadowRoot.querySelector(`[data-menubtn-entity-sugg="${t}"]`);Be(e,i,n=>{e.value=n,i.hidden=!0;const s=Array.isArray(this._config.menu_buttons)?[...this._config.menu_buttons]:[];s[t]&&(s[t]={...s[t],entity:n},this._set("menu_buttons",s))})}),this.shadowRoot.querySelectorAll("input[data-menubtn][data-mbfield='icon']").forEach(e=>{const t=Number(e.dataset.menubtn),i=this.shadowRoot.querySelector(`[data-menubtn-icon-sugg="${t}"]`);Ve(e,i,n=>{e.value=n,i&&(i.hidden=!0);const s=Array.isArray(this._config.menu_buttons)?[...this._config.menu_buttons]:[];s[t]&&(s[t]={...s[t],icon:n},this._set("menu_buttons",s))})}),this.shadowRoot.querySelectorAll("input[data-menubtn][data-mbfield='icon_on']").forEach(e=>{const t=Number(e.dataset.menubtn),i=this.shadowRoot.querySelector(`[data-menubtn-iconon-sugg="${t}"]`);Ve(e,i,n=>{e.value=n,i&&(i.hidden=!0);const s=Array.isArray(this._config.menu_buttons)?[...this._config.menu_buttons]:[];s[t]&&(s[t]={...s[t],icon_on:n},this._set("menu_buttons",s))})}),this.shadowRoot.querySelectorAll("input[data-menubtn][data-mbfield]").forEach(e=>{"icon"!==e.dataset.mbfield&&"icon_on"!==e.dataset.mbfield&&e.addEventListener("change",()=>{const t=Number(e.dataset.menubtn),i=e.dataset.mbfield,n=Array.isArray(this._config.menu_buttons)?[...this._config.menu_buttons]:[];if(!n[t])return;const s={...n[t]},r=e.value.trim();r?s[i]=r:delete s[i],n[t]=s,this._set("menu_buttons",n)})});const Ne=X("menubtn-entity-input"),qe=X("menubtn-entity-sugg"),We=X("menubtn-icon-input"),Ue=X("menubtn-add-btn");Be(Ne,qe,e=>{Ne&&(Ne.value=e),qe&&(qe.hidden=!0)});const Ke=X("menubtn-icon-sugg");Ve(We,Ke,e=>{We&&(We.value=e),Ke&&(Ke.hidden=!0)}),Ue&&Ue.addEventListener("click",()=>{const e=(Ne?.value||"").trim(),t=(We?.value||"").trim();if(!e||!t)return;const i=Array.isArray(this._config.menu_buttons)?[...this._config.menu_buttons]:[];i.push({entity:e,icon:t}),this._set("menu_buttons",i),Ne&&(Ne.value=""),We&&(We.value=""),this._scheduleRender()});const Ye=this.shadowRoot.getElementById("livecam-tags-dnd");if(Ye){let e=null;const t=()=>Ye.querySelectorAll(".dnd-over").forEach(e=>e.classList.remove("dnd-over")),i=t=>{if(!e||e===t)return;const i=Array.isArray(this._config.live_camera_entities)?[...this._config.live_camera_entities]:[],n=i.indexOf(e),s=i.indexOf(t);n<0||s<0||(i.splice(n,1),i.splice(s,0,e),this._set("live_camera_entities",i),this._scheduleRender())};Ye.querySelectorAll("[data-dragcam]").forEach(n=>{n.addEventListener("dragstart",t=>{e=n.dataset.dragcam,n.classList.add("dnd-dragging"),t.dataTransfer.effectAllowed="move"}),n.addEventListener("dragend",()=>{n.classList.remove("dnd-dragging"),t(),e=null}),n.addEventListener("dragover",i=>{i.preventDefault(),i.dataTransfer.dropEffect="move",n.dataset.dragcam!==e&&(t(),n.classList.add("dnd-over"))}),n.addEventListener("dragleave",()=>n.classList.remove("dnd-over"),Z),n.addEventListener("drop",e=>{e.preventDefault(),t(),i(n.dataset.dragcam)});const s=n.querySelector(".livecam-tag-grip");s&&(s.addEventListener("touchstart",t=>{t.preventDefault(),e=n.dataset.dragcam,n.classList.add("dnd-dragging")},{passive:!1}),s.addEventListener("touchmove",i=>{i.preventDefault();const n=i.touches[0],s=this.shadowRoot.elementFromPoint?this.shadowRoot.elementFromPoint(n.clientX,n.clientY):document.elementFromPoint(n.clientX,n.clientY),r=s?.closest?.("[data-dragcam]");t(),r&&r.dataset.dragcam!==e&&r.classList.add("dnd-over")},{passive:!1}),s.addEventListener("touchend",s=>{s.preventDefault(),n.classList.remove("dnd-dragging");const r=Ye.querySelector(".dnd-over"),o=r?.dataset?.dragcam;t(),o&&i(o),e=null},{passive:!1}))})}this.shadowRoot.querySelectorAll(".seg[data-pos]").forEach(e=>{e.addEventListener("click",()=>this._set("bar_position",e.dataset.pos))});const Ze=e=>{he&&(he.textContent=`${e}%`)};le?.addEventListener("input",e=>{const t=Number(e.target.value);Ze(t)}),le?.addEventListener("change",e=>{const t=Number(e.target.value);Ze(t),this._set("bar_opacity",Number.isFinite(t)?t:45)});const Xe=e=>{me&&(me.textContent=`${e}px`)};pe?.addEventListener("input",e=>{Xe(Number(e.target.value))}),pe?.addEventListener("change",e=>{const t=Number(e.target.value);Xe(t),this._set("pill_size",Number.isFinite(t)?t:14)});const Qe=e=>{_e&&(_e.textContent=`${e}%`)};ge?.addEventListener("input",e=>{Qe(Number(e.target.value))}),ge?.addEventListener("change",e=>{const t=Number(e.target.value);Qe(t),this._set("thumbnail_frame_pct",Number.isFinite(t)?Math.round(t):0)}),X("browser-backdrop")?.addEventListener("click",()=>{this._closeMediaBrowser()}),X("browser-close")?.addEventListener("click",()=>{this._closeMediaBrowser()}),X("browser-back")?.addEventListener("click",async()=>{await this._mediaBrowserGoBack()}),X("browser-select-current")?.addEventListener("click",()=>{this._mediaBrowserPath&&(this._appendMediaSourceValue(this._mediaBrowserPath),this._closeMediaBrowser())}),this.shadowRoot.querySelectorAll("[data-browser-open]").forEach(e=>{e.addEventListener("click",async()=>{const t=e.dataset.browserOpen||"";t&&await this._loadMediaBrowser(t,!0)})}),this.shadowRoot.querySelectorAll("[data-browser-select]").forEach(e=>{e.addEventListener("click",()=>{const t=e.dataset.browserSelect||"";t&&(this._appendMediaSourceValue(t),this._closeMediaBrowser())})});try{const e=this._focusState;if(e&&e.id){const t=X(e.id);t&&"function"==typeof t.focus&&(null!=e.value&&"string"==typeof t.value&&t.value!==e.value&&(t.value=e.value),t.focus({preventScroll:!0}),null!=e.start&&null!=e.end&&"function"==typeof t.setSelectionRange&&t.setSelectionRange(e.start,e.end))}}catch(e){}this._renderSuggestions("entities"),this._renderSuggestions("mediasources")}_renderSuggestions(e){const t=this.shadowRoot?.getElementById(`${e}-suggestions`);if(!t)return;const i=this._suggestState[e]||{open:!1,items:[],index:-1};if(!i.open||!i.items.length)return t.innerHTML="",void(t.hidden=!0);const n=i.index>=0&&i.items[i.index]?i.items[i.index]:"";t.hidden=!1,t.innerHTML=`\n      <div class="sugg-label">Suggestions</div>\n      ${i.items.map((t,n)=>`\n            <button\n              type="button"\n              class="sugg-item ${n===i.index?"active":""}"\n              data-sugg-id="${e}"\n              data-sugg-value="${t.replace(/"/g,"&quot;")}"\n              title="${t.replace(/"/g,"&quot;")}"\n            >\n              ${t}\n            </button>\n          `).join("")}\n      ${n?`<div class="sugg-active-path">${n}</div>`:""}\n    `,t.querySelectorAll("[data-sugg-id]").forEach(t=>{t.addEventListener("mousedown",i=>{i.preventDefault(),this._applySuggestion(e,t.dataset.suggValue||"")})})}_replaceCurrentLine(e,t){const i=this._getTextareaLineInfo(e),n=i.value.slice(0,i.lineStart),s=n+t+i.value.slice(i.lineEnd);e.value=s;const r=n.length+t.length;try{e.setSelectionRange(r,r),e.focus({preventScroll:!0})}catch(e){}}_initCollapsibleRows(e={}){const t=this.shadowRoot;if(!t)return;const i=this._activeTab||"general",n=e=>"cgc_ed_sec_"+i+"_"+e.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,""),s=(e,t)=>{try{localStorage.setItem(e,t?"true":"false")}catch(e){}};t.querySelectorAll(".tabpanel .row").forEach(t=>{if(t.dataset.cgcCol)return;t.dataset.cgcCol="1";const i=Array.from(t.children);if(1===i.length&&i[0].classList.contains("row-head"))return;const r=t.querySelector(":scope > .lbl");if(!r)return;const o=r.textContent.trim();if(!o)return;const a=n(o),l=(e=>{try{const t=localStorage.getItem(e);return null===t||"false"!==t}catch(e){return!0}})(a),c=document.createElement("details");c.className="cgc-row-details",l&&c.setAttribute("open","");const d=document.createElement("summary");d.className="cgc-row-summary";const h=document.createElement("span");h.className="details-chevron",h.innerHTML=fe("mdi:chevron-right",16);const p=document.createElement("span");p.className="lbl",p.style.margin="0",p.textContent=o,d.appendChild(p),d.appendChild(h);const u=document.createElement("div");u.className="cgc-row-body",[...t.childNodes].forEach(e=>{e!==r&&u.appendChild(e)}),r.remove(),c.appendChild(d),c.appendChild(u),t.appendChild(c),c.addEventListener("toggle",()=>s(a,c.open),e)}),t.querySelectorAll("details:not(.cgc-row-details)").forEach(t=>{if(t.dataset.cgcCol)return;t.dataset.cgcCol="1";const i=t.querySelector("summary span, summary .lbl")?.textContent?.trim()||t.querySelector("summary")?.textContent?.trim()||"";if(!i)return;const r=n(i);try{const e=localStorage.getItem(r);"false"===e?t.removeAttribute("open"):"true"===e&&t.setAttribute("open","")}catch(e){}t.addEventListener("toggle",()=>s(r,t.open),e)})}_scheduleRender(){this._captureScrollState(),this._raf&&cancelAnimationFrame(this._raf),this._raf=requestAnimationFrame(()=>{this._render(),this._restoreScrollState()})}_set(e,t){if("live_provider"===e)return;if("preview_close_on_tap"===e)return;if(this._config={...this._config,[e]:t},this._config=this._stripAlwaysTrueKeys(this._config),"shell_command"!==e&&"shell_command"in this._config){const e={...this._config};delete e.shell_command,this._config=e}this._fire();new Set(["source_mode","live_enabled","live_camera_entities","object_filters","delete_service","live_camera_entity","menu_buttons","frigate_url"]).has(e)&&this._scheduleRender()}_setActiveTab(e){this._activeTab=String(e||"general"),this._scheduleRender()}_setControlValue(e,t){if(e){try{e.value=t}catch(e){}try{"_value"in e&&(e._value=t)}catch(e){}}}setConfig(e){if(this._config=this._stripAlwaysTrueKeys({...e||{}}),void 0===this._config.autoplay&&(this._config.autoplay=he),void 0===this._config.auto_muted&&(this._config.auto_muted=de),void 0===this._config.live_auto_muted&&(this._config.live_auto_muted=ue),"shell_command"in this._config){const e={...this._config};delete e.shell_command,this._config=e}try{const t={...e||{}},i=e=>(e||[]).map(String).map(e=>e.trim()).filter(Boolean),n=Array.isArray(t.entities)?t.entities:null,s=String(t.entity||"").trim(),r=n&&i(n)||(s?[s]:[]);if(!(Array.isArray(this._config.entities)&&this._config.entities.length)&&r.length&&("entity"in t||s)){const e={...this._config,entities:r};delete e.entity,this._config=this._stripAlwaysTrueKeys(e),this._fire()}const o=Array.isArray(t.media_sources)?t.media_sources:null,a=Array.isArray(t.media_folders_fav)?t.media_folders_fav:null,l=String(t.media_source||"").trim(),c=o&&i(o)||a&&i(a)||(l?[l]:[]),d=Array.isArray(this._config.media_sources)&&this._config.media_sources.length,h="media_folder_favorites"in t||"media_folders_fav"in t||"media_source"in t;if(!d&&c.length&&(h||l)){const e={...this._config,media_sources:c};delete e.media_folder_favorites,delete e.media_folders_fav,delete e.media_source,this._config=this._stripAlwaysTrueKeys(e),this._fire()}const p=Array.isArray(t.object_filters)?t.object_filters:String(t.object_filters||"").trim()?[t.object_filters]:[],u=this._normalizeObjectFilters(p),m=Array.isArray(this._config.object_filters)?this._normalizeObjectFilters(this._config.object_filters):[];if(JSON.stringify(u)!==JSON.stringify(m)){const e={...this._config};u.length?e.object_filters=u:delete e.object_filters,this._config=this._stripAlwaysTrueKeys(e),this._fire()}const g=String(t.thumb_layout||"").toLowerCase().trim();"horizontal"!==g&&"vertical"!==g||this._config.thumb_layout!==g&&(this._config=this._stripAlwaysTrueKeys({...this._config,thumb_layout:g}),this._fire())}catch(e){}this._scheduleRender()}set hass(e){const t=this._hass;if(this._hass=e,this._mediaBrowserOpen)return;const i=this.shadowRoot?.activeElement,n=String(i?.tagName||"").toLowerCase(),s=String(i?.id||"");if(!!(!i||"input"!==n&&"textarea"!==n&&"entities"!==s&&"mediasources"!==s&&"filenamefmt"!==s&&"thumb"!==s&&"maxmedia"!==s&&"new-filter-name"!==s&&"new-filter-icon"!==s)){if(t){const i=t.themes?.darkMode!==e.themes?.darkMode||JSON.stringify(Object.keys(t.states).filter(e=>e.startsWith("camera.")||e.startsWith("sensor.")))!==JSON.stringify(Object.keys(e.states).filter(e=>e.startsWith("camera.")||e.startsWith("sensor.")));if(!i)return}this._scheduleRender()}}_sortUniqueStrings(e){const t=[],i=new Set;for(const n of e||[]){const e=String(n||"").trim();if(!e)continue;const s=e.toLowerCase();i.has(s)||(i.add(s),t.push(e))}return t.sort((e,t)=>e.localeCompare(t))}_sourcesToText(e){const t=Array.isArray(e)?e.map(String).map(e=>e.trim()).filter(Boolean):[];return t.join("\n")}_stripAlwaysTrueKeys(e){const t={...e||{}};return"filter_folders_enabled"in t&&delete t.filter_folders_enabled,"live_provider"in t&&delete t.live_provider,"media_folder_favorites"in t&&delete t.media_folder_favorites,"media_folder_filter"in t&&delete t.media_folder_filter,"media_folders_fav"in t&&delete t.media_folders_fav,"preview_close_on_tap"in t&&delete t.preview_close_on_tap,t}_toRel(e){return String(e||"").replace(/^media-source:\/\/media_source\//,"").replace(/^media-source:\/\/media_source/,"").replace(/^media-source:\/\/frigate\//,"frigate/").replace(/^media-source:\/\/frigate/,"frigate").replace(/^media-source:\/\//,"").replace(/^\/+/,"").trim()}_toggleObjectFilter(e){const t=String(e||"").toLowerCase().trim();if(!t)return;if(!ce.includes(t))return;const i=this._normalizeObjectFilters(this._config.object_filters||[]),n=new Set(i);n.has(t)?n.delete(t):n.add(t);const s=Array.from(n),r={...this._config};s.length?r.object_filters=s:delete r.object_filters,this._config=this._stripAlwaysTrueKeys(r),this._fire(),this._scheduleRender()}async _updateSuggestions(e){const t=this.shadowRoot?.getElementById(e);if(!t)return;const i=this._getTextareaLineInfo(t),n=String(i.line||"").trim();if("entities"===e){const t=this._collectEntitySuggestions(),i=this._filterSuggestions(t,n).filter(e=>String(e).trim()!==n),s=JSON.stringify(i);if(this._lastSuggestFingerprint[e]===s)return;return this._lastSuggestFingerprint[e]=s,i.length?void this._openSuggestions(e,i):void this._closeSuggestions(e)}"mediasources"===e&&(clearTimeout(this._mediaSuggestTimer),this._mediaSuggestTimer=setTimeout(async()=>{const t=++this._mediaSuggestReq,i=(await this._collectMediaSuggestionsDynamic(n)).filter(e=>String(e).trim()!==n);if(t!==this._mediaSuggestReq)return;const s=JSON.stringify(i);this._lastSuggestFingerprint[e]!==s&&(this._lastSuggestFingerprint[e]=s,i.length?this._openSuggestions(e,i):this._closeSuggestions(e))},120))}_validateMediaFolders(e){if(!e)return"neutral";const t=e.split(/\n|,/g).map(e=>e.trim()).filter(Boolean);if(!t.length)return"neutral";for(const e of t){if(!e.startsWith("media-source://"))return"invalid";if(/\.(jpg|jpeg|png|mp4|mov|mkv|avi|json|txt)$/i.test(e))return"invalid"}return"valid"}_validateSensors(e){if(!e)return"neutral";const t=e.split(/\n|,/g).map(e=>e.trim()).filter(Boolean);if(!t.length)return"neutral";for(const e of t){if(!e.startsWith("sensor."))return"invalid";if(!this._hass?.states?.[e])return"invalid"}return"valid"}_renderFilesWizard(){const e=this._wizardStatus,t="loading"===e;return`\n      <div class="cgc-wizard">\n        <button class="cgc-wizard-toggle" id="cgc-wizard-toggle">\n          ${this._wizardOpen?"▾":"▸"} Create new FileTrack sensor\n        </button>\n        <a class="cgc-wizard-link" href="https://github.com/TheScubadiver/FileTrack" target="_blank" rel="noopener">FileTrack op GitHub</a>\n        ${this._wizardOpen?`\n          <div class="cgc-wizard-body">\n            <div class="cgc-wizard-row">\n              <div class="cgc-wizard-folder-row">\n                <span class="cgc-wizard-prefix">/config/www/</span>\n                <input type="text" class="ed-input" id="cgc-wizard-folder" value="${this._wizardFolder}" />\n              </div>\n            </div>\n            <div class="cgc-wizard-row">\n              <div class="cgc-wizard-folder-row">\n                <span class="cgc-wizard-prefix">sensor.</span>\n                <input type="text" class="ed-input" id="cgc-wizard-name" value="${this._wizardName}" />\n              </div>\n            </div>\n            <button class="cgc-wizard-btn" id="cgc-wizard-create" ${this._wizardFolder&&this._wizardName&&!t?"":"disabled"}>\n              ${t?"Creating…":"Create sensor"}\n            </button>\n            ${!0===e?.ok?`\n              <div class="cgc-wizard-success">\n                ✓ Sensor created! Select <code>${e.entityId}</code> in the sensor field above.\n              </div>\n            `:""}\n            ${!1===e?.ok?`\n              <div class="cgc-wizard-error">✗ ${e.error}</div>\n            `:""}\n          </div>\n        `:""}\n      </div>\n    `}_bindWizardEvents(e={}){const t=this.shadowRoot,i=t?.getElementById("cgc-wizard-toggle"),n=t?.getElementById("cgc-wizard-folder"),s=t?.getElementById("cgc-wizard-name"),r=t?.getElementById("cgc-wizard-create");i&&(i.onclick=()=>{this._wizardOpen=!this._wizardOpen,this._scheduleRender()}),n&&(n.oninput=e=>{this._wizardFolder=e.target.value,this._wizardStatus=null,this._updateWizardButton()}),s&&(s.oninput=e=>{const t=e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,"_");this._wizardName=t,e.target.value=t,this._wizardStatus=null,this._updateWizardButton()}),r&&(r.onclick=()=>this._createFilesSensor())}_updateWizardButton(){const e=this.shadowRoot?.getElementById("cgc-wizard-create");e&&(e.disabled=!this._wizardFolder||!this._wizardName)}async _createFilesSensor(){const e=this.shadowRoot?.getElementById("cgc-wizard-folder"),t=this.shadowRoot?.getElementById("cgc-wizard-name"),i=this.shadowRoot?.getElementById("cgc-wizard-create"),n=(e?.value||this._wizardFolder).trim().replace(/^\//,"").replace(/\/$/,""),s=(t?.value||this._wizardName).trim();if(n&&s){this._wizardFolder=n,this._wizardName=s,i&&(i.disabled=!0,i.textContent="Bezig…");try{await this._hass.callService("filetrack","add_sensor",{name:s,folder:"/config/www/"+n,filter:"*",sort:"date",recursive:!1});const e="sensor."+s.toLowerCase().replace(/[^a-z0-9_]/g,"_").replace(/_+/g,"_").replace(/^_|_$/g,"");this._wizardStatus={ok:!0,entityId:e}}catch(e){const t=(e?.message||String(e)).toLowerCase();if(t.includes("exist")||t.includes("already")||t.includes("fileexist")){const e="sensor."+s.toLowerCase().replace(/[^a-z0-9_]/g,"_").replace(/_+/g,"_").replace(/^_|_$/g,"");this._wizardStatus={ok:!0,entityId:e}}else this._wizardStatus={ok:!1,error:e?.message||String(e)}}this._scheduleRender()}}}customElements.get("camera-gallery-card-editor")||customElements.define("camera-gallery-card-editor",we)}();
