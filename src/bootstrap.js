/**
 * Copyright 2013 Jorge Villalobos
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

"use strict";

const Cc = Components.classes;
const Ci = Components.interfaces;

const RE_DOMAINS = /(?:mozilla|allizom|getpersonas)\.(?:org|com)/i;
const RE_LISTING_PAGE =
  /^(?:https\:\/\/addons(?:-dev)?\.(?:mozilla|allizom)\.org)?\/(?:z\/)?(?:[a-z]{2}(?:\-[a-z]{2})?\/)?(?:(?:firefox|thunderbird|seamonkey|mobile|android)\/)?addon\/([^\/]+)/i;
const RE_EDIT_PAGE =
  /^(?:https\:\/\/addons(?:-dev)?\.(?:mozilla|allizom)\.org)?\/(?:z\/)?(?:[a-z]{2}(?:\-[a-z]{2})?\/)?developers\/addon\/([^\/]+)(?:\/([^\/]+))?/i;
const RE_BG_THEME_EDIT_PAGE =
  /^(?:https\:\/\/addons(?:-dev)?\.(?:mozilla|allizom)\.org)?\/(?:z\/)?(?:[a-z]{2}(?:\-[a-z]{2})?\/)?developers\/theme\/([^\/]+)(?:\/([^\/]+))?/i;
const RE_USER_PAGE =
  /^(?:https\:\/\/addons(?:-dev)?\.(?:mozilla|allizom)\.org)?\/(?:z\/)?(?:[a-z]{2}(?:\-[a-z]{2})?\/)?(?:(?:firefox|thunderbird|seamonkey|mobile|android)\/)?user\//i;
const RE_USER_ADMIN_PAGE =
  /^(?:https\:\/\/addons(?:-dev)?\.(?:mozilla|allizom)\.org)?\/(?:z\/)?(?:[a-z]{2}(?:\-[a-z]{2})?\/)?admin\/models\/auth\/user\/([0-9]+)?/i;
const RE_PERSONA_PAGE =
  /^https?\:\/\/www.getpersonas.com\/(?:[a-z]{2}(?:\-[a-z]{2})?\/)?persona\//i;
const RE_IS_PREVIEW = /^https\:\/\/addons-dev\.allizom\.org/i;
const RE_FILE_VIEWER =
  /^(?:https\:\/\/addons(?:-dev)?\.(?:mozilla|allizom)\.org)?\/(?:z\/)?(?:[a-z]{2}(?:\-[a-z]{2})?\/)?(?:(?:firefox|thunderbird|seamonkey|mobile|android)\/)?files\//i;
const RE_ADDONS_MXR = /^https:\/\/mxr\.mozilla\.org\/addons\//i;
const RE_MXR_LINK = /\/addons\/source\/([0-9]+)\//;

function install(aData, aReason) {}

function uninstall(aData, aReason) {}

function startup(aData, aReason) {
  AAA.init();
}

function shutdown(aData, aReason) {
  AAA.uninit();
}

let AAA = {
  windowListener :
    {
      addListener : function(aWindow) {
        aWindow.AAAListener =
          function(aEvent) { AAA.handleLoad(aEvent); };
        AAA.getGBrowser(aWindow).addEventListener(
          "load", aWindow.AAAListener, true, true);
      },

      removeListener : function(aWindow) {
        AAA.getGBrowser(aWindow).removeEventListener(
          "load", aWindow.AAAListener, true, true);
        aWindow.AAAListener = null;
      },

      onOpenWindow : function(xulWindow) {
        // A new window has opened.
        let that = this;
        let domWindow =
          xulWindow.QueryInterface(Ci.nsIInterfaceRequestor).
          getInterface(Ci.nsIDOMWindow);

        // Wait for it to finish loading
        domWindow.addEventListener(
          "load",
          function listener() {
            domWindow.removeEventListener("load", listener, false);
            // If this is a browser window then setup its UI
            if (domWindow.document.documentElement.getAttribute("windowtype") ==
                "navigator:browser") {
              that.addListener(domWindow);
            }
        }, false);
      },
      onCloseWindow : function(xulwindow) {},
      onWindowTitleChange: function(xulWindow, newTitle) {}
    },

  init : function() {
    let wm =
      Cc["@mozilla.org/appshell/window-mediator;1"].
        getService(Ci.nsIWindowMediator);
    let enumerator = wm.getEnumerator("navigator:browser");

    while (enumerator.hasMoreElements()) {
      this.windowListener.addListener(enumerator.getNext());
    }

    wm.addListener(this.windowListener);
  },

  uninit : function() {
    let wm =
      Cc["@mozilla.org/appshell/window-mediator;1"].
        getService(Ci.nsIWindowMediator);
    let enumerator = wm.getEnumerator("navigator:browser");

    wm.removeListener(this.windowListener);

    while (enumerator.hasMoreElements()) {
      this.windowListener.removeListener(enumerator.getNext());
    }
  },

  handleLoad : function (aEvent) {
    let doc = aEvent.originalTarget;

    // do a quick domain test to filter out pages were aren't interested in.
    if ((null != doc) && (null != doc.location) &&
        (null != doc.location.hostname) &&
        RE_DOMAINS.test(doc.location.hostname)) {
      let handler = new AAAHandler(doc);

      handler.run();
    }
  },

  getGBrowser : function (aWindow) {
    return ((null != aWindow.gBrowser) ? aWindow.gBrowser : aWindow.BrowserApp.deck);
  }
};

function AAAHandler(aDocument) {
  this._doc = aDocument;
  this._href = aDocument.location.href;
};

AAAHandler.prototype = {
  /**
   * Runs the AAA handler in the given document.
   */
  run : function() {
    // check if this is a listing page.
    let matchListing = this._href.match(RE_LISTING_PAGE, "ig");

    if (matchListing && (2 <= matchListing.length)) {
      this._log("Found an AMO listing page.");
      // this is an AMO listing page. matchListing[1] is the add-on slug.
      this._modifyListingPage(matchListing[1]);
      // let the record state I hate early returns, but the logic in this
      // function was becoming a bit unruly.
      return;
    }

    // not a listing page, check if this is an edit page.
    let matchEdit = this._href.match(RE_EDIT_PAGE, "ig");

    if (matchEdit && (2 <= matchEdit.length)) {
      // this excludes validation result pages.
      if ((2 == matchEdit.length) || ("file" != matchEdit[2])) {
        this._log("Found an AMO edit page.");
        // this is an AMO edit page. matchEdit[1] is the add-on slug.
        this._modifyEditPage(matchEdit[1]);
      }

      return;
    }

    // check if this is a bg theme edit page.
    let matchBgEdit = this._href.match(RE_BG_THEME_EDIT_PAGE, "ig");

    if (matchBgEdit && (2 <= matchBgEdit.length)) {
      this._log("Found an AMO bg theme edit page.");
      // this is an AMO bg theme edit page. matchBgEdit[1] is the add-on slug.
      this._modifyBgThemeEditPage(matchBgEdit[1]);

      return;
    }

    // check if this is a user admin page.
    let matchUserAdmin = this._href.match(RE_USER_ADMIN_PAGE, "ig");

    if (matchUserAdmin) {
      if (null != matchUserAdmin[1]) {
        this._log("Found a user admin page.");
        // this is a user admin page. matchUserAdmin[1] is the user ID.
        this._modifyUserAdminPage(matchUserAdmin[1]);
      } else {
        this._log("Found a user admin search page.");
        this._modifyUserAdminSearchPage();
      }

      return;
    }

    // nope, test the simpler cases.
    if (RE_ADDONS_MXR.test(this._href)) {
      this._log("Found an add-ons MXR page.");
      this._addLinksToMXR();
    } else if (RE_FILE_VIEWER.test(this._href)) {
      this._log("Found a source viewer page.");
      this._widenSourceViewer();
    } else if (RE_PERSONA_PAGE.test(this._href)) {
      this._log("Found a getpersonas page.");
      this._addLinksToGetPersonas();
    } else if (RE_USER_PAGE.test(this._href)) {
      this._log("Found a user profile page.");
      this._addLinksToUserPage();
    }
  },

  /**
   * Adds a few useful admin links to listing pages, and exposes the internal
   * add-on id.
   */
  _modifyListingPage : function(aSlug) {
    let isPersonaListing =
      (null != this._doc.getElementById("persona-summary"));

    if (isPersonaListing) {
      this._modifyPersonaListing(aSlug);
    } else {
      this._modifyRegularListing(aSlug);
    }
  },

  /**
   * Adds a few useful admin links to Persona listing pages.
   */
  _modifyPersonaListing : function(aSlug) {
    let summaryNode = this._doc.getElementById("persona-summary");
    let personaNode =
      this._getSingleXPath(
        "//div[@class='persona-preview']/div[@data-browsertheme]");

    if (null != personaNode) {
      let personaJSON = personaNode.getAttribute("data-browsertheme");
      let persona = JSON.parse(personaJSON);
      let headerLink = this._createLink("Header", persona.headerURL);
      let footerLink = this._createLink("Footer", persona.footerURL);
      let insertionPoint = this._getSingleXPath("//div[@class='widgets']");

      if (null != insertionPoint) {
        headerLink.setAttribute("class", "collection-add widget collection");
        insertionPoint.appendChild(headerLink);

        footerLink.setAttribute("class", "collection-add widget collection");
        insertionPoint.appendChild(footerLink);
      } else {
        this._log("Insertion point could not be found.");
      }
    } else {
      this._log("Persona node could not be found.");
    }
  },

  /**
   * Adds header and footer links for Personas pages at getpersonas.com.
   */
  _addLinksToGetPersonas : function() {
    let detailNode = this._getSingleXPath("//img[@class='detailed-view']");

    if (null != detailNode) {
      let personaJSON = detailNode.getAttribute("persona");
      let persona = JSON.parse(personaJSON);
      let headerLink =
        this._createLink("Header", this._removeRand(persona.headerURL));
      let footerLink =
        this._createLink("Footer", this._removeRand(persona.footerURL));
      let insertionPoint = this._doc.getElementById("buttons");

      if (null != insertionPoint) {
        headerLink.setAttribute("style", "margin-right: 1em;");
        insertionPoint.appendChild(headerLink);

        insertionPoint.appendChild(footerLink);
      } else {
        this._log("Insertion point could not be found.");
      }
    } else {
      this._log("Persona node could not be found.");
    }
  },

  /**
   * Adds a few useful admin links to non-Persona add-on listing pages, and
   * exposes the internal add-on id.
   */
  _modifyRegularListing : function(aSlug) {
    let addonNode = this._doc.getElementById("addon");
    let is404 = (null == addonNode);
    let adminLink = this._createAdminLink(aSlug);
    let reviewLink = this._createAMOReviewLink(aSlug);
    let insertionPoint = null;

    if (!is404) {
      this._showAddonId(addonNode);
      insertionPoint = this._getSingleXPath("//div[@class='widgets']");

      if (null == insertionPoint) {
        this._log("There's no widgets section!");
      }
    } else {
      this._log("There is no add-on node. This may be a 404 page.");

      let aside = this._getSingleXPath("//aside[@class='secondary']");

      if (null != aside) {
        insertionPoint = this._doc.createElement("div");
        insertionPoint.setAttribute("style", "margin-top: 1em;");
        aside.appendChild(insertionPoint);
      }
    }

    if (null != insertionPoint) {
      adminLink.setAttribute("class", "collection-add widget collection");
      insertionPoint.appendChild(adminLink);

      if (is404) {
        insertionPoint.appendChild(this._doc.createElement("br"));
      }

      reviewLink.setAttribute("class", "collection-add widget collection");
      insertionPoint.appendChild(reviewLink);

      if (is404) {
        let editLink = this._createEditLink(aSlug);

        editLink.setAttribute("class", "collection-add widget collection");
        insertionPoint.appendChild(this._doc.createElement("br"));
        insertionPoint.appendChild(editLink);
      }
    } else {
      this._log("Insertion point could not be found.");
    }
  },

  /**
   * Adds a few useful admin links to edit pages.
   * @param aSlug the slug that identifies the add-on.
   */
  _modifyEditPage : function(aSlug) {
    let result =
      this._getSingleXPath(
        "//ul[@class='refinements'][2]/li/a[contains(@href, '/addon/" + aSlug + "/')]");

    if (null != result) {
      let insertionPoint = result.parentNode;
      let container = this._doc.createElement("li");
      let adminLink = this._createAdminLink(aSlug);
      let reviewLink = this._createAMOReviewLink(aSlug);

      container.appendChild(adminLink);
      insertionPoint.insertBefore(
        container, insertionPoint.firstChild.nextSibling);

      container = this._doc.createElement("li");
      container.appendChild(reviewLink);
      insertionPoint.insertBefore(
        container, insertionPoint.firstChild.nextSibling);
    } else {
      this._log("Insertion point could not be found.");
    }
  },

  /**
   * Adds a few useful admin links to background theme edit pages.
   * @param aSlug the slug that identifies the theme.
   */
  _modifyBgThemeEditPage : function(aSlug) {
    let result = this._getSingleXPath("//div[@class='info']/p[2]");

    if (null != result) {
      let insertionPoint = result.parentNode;
      let container = this._doc.createElement("p");
      let reviewLink = this._createMPReviewLink(aSlug);

      container.appendChild(reviewLink);
      insertionPoint.insertBefore(container, result.nextSibling);
    } else {
      this._log("Insertion point could not be found.");
    }
  },

  /**
   * Adds an delete link to user pages.
   */
  _addLinksToUserPage : function() {
    let manageButton = this._doc.getElementById("manage-user");

    if (null != manageButton) {
      let manageURL = manageButton.getAttribute("href");
      let userId = manageURL.substring(manageURL.lastIndexOf("/") + 1);
      let deleteLink = this._createDeleteUserLink(userId);

      deleteLink.setAttribute("class", "button");
      deleteLink.setAttribute(
        "style",
        "background: linear-gradient(rgb(225, 15, 0), rgb(191, 13, 0)) repeat scroll 0% 0% rgb(87, 132, 191)");
      manageButton.parentNode.appendChild(deleteLink);
    } else {
      this._log("Insertion point could not be found.");
    }
  },

  /**
   * Improve the user administration page.
   * @param aUserID the user ID from the page URL.
   */
  _modifyUserAdminPage : function(aUserID) {
    let result = this._getSingleXPath("//a[@class='viewsitelink']");

    if (null != result) {
      result.setAttribute("href", ("/user/" + aUserID + "/"));
    } else {
      this._log("View on site button could not be found.");
    }
  },

  /**
   * Adds links to profile pages in user admin search results.
   */
  _modifyUserAdminSearchPage : function() {
    try {
      let xpath =
        Cc["@mozilla.org/dom/xpath-evaluator;1"].
          createInstance(Ci.nsIDOMXPathEvaluator);
      let result =
        xpath.evaluate(
          "//table[@id='result_list']/tbody/tr/th/a", this._doc, null,
          Ci.nsIDOMXPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
      let link;
      let userID;
      let newLink;

      for (let i = 0 ; i < result.snapshotLength ; i++) {
        link = result.snapshotItem(i);
        userID = link.getAttribute("href").replace("/", "");
        // create a new link that points to the profile page.
        newLink = this._doc.createElement("a");
        newLink.setAttribute("href", ("/user/" + userID + "/"));
        newLink.setAttribute("style", "margin-left: 0.5em;");
        newLink.textContent = "[" + userID + "]";
        link.parentNode.appendChild(newLink);
      }
    } catch (e) {
      this._log("_modifyUserAdminSearchPage error:\n" + e);
    }
  },

  /**
   * Makes the numeric add-on id visible in add-on listing pages.
   * @param aAddonNode the node that holds the numeric add-on id.
   */
  _showAddonId : function(aAddonNode) {
    let addonId = aAddonNode.getAttribute("data-id");
    let titleNode = this._getSingleXPath("//h1[@class='addon']");
    let numberSpan = this._doc.createElement("span");
    let spanContent = this._doc.createTextNode("[" + addonId + "]");

    numberSpan.appendChild(spanContent);
    numberSpan.setAttribute("class", "version-number");
    titleNode.appendChild(numberSpan);
  },

  /**
   * Makes the source code viewer much wider so it is easier to read.
   */
  _widenSourceViewer : function() {
    if (RE_FILE_VIEWER.test(this._doc.defaultView.location.href)) {
      let rootNode = this._doc.body.firstElementChild;
      let contentNode = this._doc.getElementById("content-wrapper");

      rootNode.setAttribute("style", "width: 90%; max-width: inherit;");
      contentNode.style.paddingLeft = "15%";
    }
  },

  /**
   * Adds add-on links to AMO from the add-ons MXR.
   */
  _addLinksToMXR : function() {
    try {
      let xpath =
        Cc["@mozilla.org/dom/xpath-evaluator;1"].
          createInstance(Ci.nsIDOMXPathEvaluator);
      let result =
        xpath.evaluate(
          "//a[number(substring-before(substring(@href,16), '/')) > 0 and " +
          "string-length(substring-after(substring(@href,16), '/')) = 0]",
          this._doc, null, Ci.nsIDOMXPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
          null);
      let link;
      let editLink;
      let match;

      for (let i = 0 ; i < result.snapshotLength ; i++) {
        link = result.snapshotItem(i);
        match = link.getAttribute("href").match(RE_MXR_LINK, "ig");

        if (match && (2 <= match.length)) {
          editLink = this._createEditLink(match[1], "[Edit on AMO]");
          editLink.setAttribute("style", "margin-left: 0.4em;");
          link.parentNode.insertBefore(editLink, link.nextSibling);
        } else {
          this._log("Error getting add-on id from link.");
        }
      }
    } catch (e) {
      this._log("_addLinksToMXR error:\n" + e);
    }
  },

  _isPreview : function() {
    return RE_IS_PREVIEW.test(this._href);
  },

  _createAdminLink : function(aId) {
    let link =
      this._createAMOLink(
        "Admin this Add-on", "/admin/addon/manage/$(PARAM)", aId);

    return link;
  },

  _createEditLink : function(aId, aText) {
    let link =
      this._createAMOLink(
        ((null != aText) ? aText : "Edit this Add-on"),
        "/developers/addon/$(PARAM)/edit/", aId);

    return link;
  },

  _createDeleteUserLink : function(aId) {
    let link =
      this._createAMOLink(
        "Delete user", "/admin/models/users/userprofile/$(PARAM)/delete/", aId);

    return link;
  },

  _createAMOReviewLink : function(aId) {
    let link =
      this._createAMOLink(
        "Review this Add-on", "/editors/review/$(PARAM)", aId);

    return link;
  },

  _createMPReviewLink : function(aId) {
    let link =
      this._createMPLink(
        "Review this Add-on", "/reviewers/themes/queue/single/$(PARAM)", aId);

    return link;
  },

  _createAMOLink : function(aText, aPath, aParameter) {
    let isPreview = this._isPreview();
    let domain = (!isPreview ? "addons.mozilla.org" : "addons-dev.allizom.org");
    let href = "https://" + domain + aPath;

    href = href.replace("$(PARAM)", aParameter);

    return this._createLink(aText, href);
  },

  _createMPLink : function(aText, aPath, aParameter) {
    let isPreview = this._isPreview();
    let domain =
      (!isPreview ? "marketplace.mozilla.org" : "marketplace-dev.allizom.org");
    let href = "https://" + domain + aPath;

    href = href.replace("$(PARAM)", aParameter);

    return this._createLink(aText, href);
  },

  /**
   * Creates an 'a' node with the given text and URL.
   * @param aText the text in the link.
   * @param aURL the URL the link points to.
   */
  _createLink : function(aText, aURL) {
    let link = this._doc.createElement("a");
    let linkContent = this._doc.createTextNode(aText);

    link.setAttribute("href", aURL);
    link.appendChild(linkContent);

    return link;
  },

  /**
   * Gets a single node using an XPath expression.
   */
  _getSingleXPath : function(aXPathExp) {
    let node = null;

    try {
      let xpath =
        Cc["@mozilla.org/dom/xpath-evaluator;1"].
          createInstance(Ci.nsIDOMXPathEvaluator);
      let xpathResult =
        xpath.evaluate(
          aXPathExp, this._doc.documentElement, null,
          Ci.nsIDOMXPathResult.FIRST_ORDERED_NODE_TYPE, null);

      node = xpathResult.singleNodeValue;
    } catch (e) {
      this._log("Error getting node using XPATH:\n" + e);
    }

    return node;
  },

  /**
   * Removes the random parameter (like ?2304345) from a URL.
   */
  _removeRand : function(aURL) {
    return aURL.substring(0, aURL.indexOf('?'));
  },

  _log : function (aText) {
    this._doc.defaultView.console.log(aText);
  }
};
