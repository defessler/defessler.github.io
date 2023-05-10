/**
 * Monkey patch jQuery so that for each AJAX request, it grabs the CSRF token 
 * directly from the cookie and sets it as a header. This way, it will always 
 * send the newest token.
 */
(function(allTheJQueries) {

	function validateUrl(url) {
		if (typeof url !== 'string') {
			return false;
		}

		// If the URL does not begin with 'http' then it is a relative path,
		// so it is okay
		if (url.indexOf('http') !== 0) {
			return true;
		}

		// If it is a fully qualified URL, then it MUST be to the current host
		var upperCaseUrl = url.toUpperCase();
		var upperCaseDocumentLocationOrigin = document.location.origin.toUpperCase();

		return upperCaseUrl.indexOf(upperCaseDocumentLocationOrigin) === 0;
	}

	/**
	 * This is called every AJAX request, and adds our CSRF token header
	 * to the request
	 */
	function setHeader(options) {
		var csrfResponseHeaderName = "X-XSRF-TOKEN";

		if (!validateUrl(options.url)) {
			return;
		}

		options.headers = typeof options.headers === 'object' ? options.headers : {};
		options.headers[csrfResponseHeaderName] = getCSRFToken();
	}

	/**
	 * Modify the given version of jquery
	 */
	function modifyPrefilter(jQuery) {
		if (typeof jQuery === "undefined"||
			typeof jQuery.ajaxPrefilter !== "function"
		) {
			return false;
		}

		// Sanity check. Did we already override beforeSend?
		if (jQuery.csrfProtection && jQuery.csrfProtection === "enabled") {
			return false;
		}

		jQuery.ajaxPrefilter(setHeader);

		jQuery.csrfProtection = "enabled";

		return true;
	}


	/**
	 * Reads a CSRF token cookie value and appends it to
	 *
	 * @param jQueryImpl
	 * @returns {boolean}
	 */
	function appendCSRFTokenOnFormSubmit(jQueryImpl) {
		if (typeof jQueryImpl === "undefined" ) {
			return false;
		}

		// Settings page has their own submit handler. We are handling
		// token injection there.
		if (window.location.href.indexOf('main.php?action=settings') !== -1) {
			return false;
		}

		try {
			jQueryImpl(document).on('submit', 'form', function() {
				appendCSRFToken(this);
			});
		} catch (e) {
			return false;
		}

		return true;
	}

	// As there are several jQuery versions, just register on one
	var csrfFormInterceptorRegistered = false;

	// We need to do this to ALL of the given versions.
	// We use different versions at different times.
	allTheJQueries.forEach(function(jQueryImpl) {
		modifyPrefilter(jQueryImpl);
		if (!csrfFormInterceptorRegistered) {
			csrfFormInterceptorRegistered = appendCSRFTokenOnFormSubmit(jQueryImpl);
		}
	});

})([window.jQuery, window.$J, window.$]);

/**
 * Extracts CSRF protection token from the carrier cookie
 *
 * @returns {string}
 */
function getCSRFToken() {
	var csrfCookieName = 'XSRF-TOKEN';

	var cookie = window.document.cookie
		// Break up all the cookies
			.split(';')
			// Filter out only cookies with right name
			.filter(function(cookiePart) {
				return cookiePart.indexOf(csrfCookieName) > -1;
			})
			// Get the first instance of the CSRF cookiecsr
			// (In testing we only want the first one, not the last one.)
			.shift()
	;

	if (typeof cookie === 'undefined') {
		return;
	}

	// Here we split the token cookie and grab just the token itself:
	// XSRF-TOKEN=sometoken => ["XSRF-TOKEN", "sometoken"] => 'sometoken'
	var token = cookie.trim().split('=').pop();
	return token;
}

/**
 * Appends a CSRF protection token to html forms upon submit. Being defined in
 * global scope, can be manually added to onSubmit event for every form missed
 * by jQuery.
 *
 * @param interceptedForm
 */
function appendCSRFToken(interceptedForm) {
	var form = interceptedForm;

	if (!form.elements) {
		form = interceptedForm.forms[0];
	}

	var csrfInput = getCSRFInputField(form);

	if (!csrfInput) {
		csrfInput = attachNewCSRFInputFieldToForm(form);
	}

	csrfInput.setAttribute("value", getCSRFToken());
}

/**
 * Retrieves a csrf validation input field from the form
 *
 * @param myForm
 * @returns {*}
 */
function getCSRFInputField(myForm) {
	return myForm.elements._csrf;
}

/**
 * Adds a hidden csrf validation input field to a form
 *
 * @param myForm
 * @returns {HTMLInputElement}
 */
function attachNewCSRFInputFieldToForm(myForm) {
	var csrfInput = document.createElement('input');
	csrfInput.setAttribute('type', 'hidden');
	csrfInput.setAttribute('name', '_csrf');
	
	myForm.appendChild(csrfInput);
	
	return csrfInput;
}
