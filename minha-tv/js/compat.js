/* Shims for the Tizen 3.0 WebView (2017 TVs).  The whole app is ES5. */
(function () {
    var each = Array.prototype.forEach;
    if (window.NodeList && !NodeList.prototype.forEach) NodeList.prototype.forEach = each;
    if (window.HTMLCollection && !HTMLCollection.prototype.forEach) HTMLCollection.prototype.forEach = each;
    if (window.Element && !Element.prototype.matches) {
        Element.prototype.matches = Element.prototype.webkitMatchesSelector;
    }
    if (window.Element && !Element.prototype.closest) {
        Element.prototype.closest = function (sel) {
            var el = this;
            while (el && el.nodeType === 1) { if (el.matches(sel)) return el; el = el.parentNode; }
            return null;
        };
    }
    if (!Date.now) Date.now = function () { return new Date().getTime(); };
})();
