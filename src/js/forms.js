/*
 * forms.js
 * Owner: Content Sections agent.
 *
 * Purpose: the application form (apply.html) and the brand enquiry form
 * (brands.html). It checks the fields, shows one message under each field that
 * needs fixing and clears it once fixed, sends the form to the address in
 * site.forms.endpoint, and says plainly when the form is not connected yet
 * (the endpoint is empty). See docs/design-brief.md, section 9.
 *
 * This file holds no words. Every message comes from src/content, printed into
 * the page as data attributes and <template> elements:
 *
 *   form[data-form]                 a form this script looks after
 *     data-endpoint                 where to send it; empty means "not connected"
 *     data-errors-one, -many        the summary line above the fields
 *     data-sending                  the label of the button while sending
 *   [data-error]                    on a control: its message
 *   [data-validate]                 email, phone, channel or subscribers
 *   [data-min] [data-max]           the range of the subscriber count
 *   [data-error-range]              the message for a count outside that range
 *   [data-form-notice]              the "not connected" notice above the first field;
 *                                   in the page only while the endpoint is empty
 *   [data-form-summary]             live region for the summary line
 *   [data-form-status]              live region for "sent"
 *   [data-form-alert]               live region for "did not send"
 *   template[data-form-template]    summary, success, error
 *
 * While the endpoint is empty a form has method="dialog", which sends nothing
 * even without this script, and a <noscript> note beside the button says so.
 */
(function () {
  'use strict';

  const forms = document.querySelectorAll('form[data-form]');
  if (!forms.length) return;

  // The shapes a value must have.
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const HANDLE = /^@[\p{L}\p{N}_.\-]{3,30}$/u;
  const CHANNEL = /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/[^\s/?#][^\s]*$/i;
  const WHOLE = /^\d+$|^\d{1,3}(?:[ ,.\u00a0]\d{3})+$/;
  const PHONE = /^[\d\s()+.\-\/]+$/;
  const PHONE_DIGITS = 7;

  // Forms that are being sent.
  const busy = new WeakSet();

  // Keeps only the digits of a text.
  const digits = (text) => String(text || '').replace(/\D/g, '');

  // Reads a limit such as "1,000" from a data attribute.
  const limit = (text, fallback) => (digits(text) ? Number(digits(text)) : fallback);

  // The controls of a form that carry a message.
  const controlsOf = (form) => Array.from(form.querySelectorAll('[data-error]'));

  // Returns the message for a control that needs fixing, or an empty text.
  function check(control) {
    const value = control.value.trim();
    const data = control.dataset;
    const message = data.error || '';
    if (!value) return control.required ? message : '';
    if (data.validate === 'email') return EMAIL.test(value) ? '' : message;
    if (data.validate === 'channel') return HANDLE.test(value) || CHANNEL.test(value) ? '' : message;
    if (data.validate === 'phone') {
      return PHONE.test(value) && digits(value).length >= PHONE_DIGITS ? '' : message;
    }
    if (data.validate === 'subscribers') {
      if (!WHOLE.test(value)) return message;
      const count = Number(digits(value));
      const inRange = count >= limit(data.min, 0) && count <= limit(data.max, Infinity);
      return inRange ? '' : data.errorRange || message;
    }
    return '';
  }

  // Shows the message under a control, or clears it when the message is empty.
  function mark(control, message) {
    const field = control.closest('.field');
    const error = field && field.querySelector('.field__error');
    if (message) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');
    if (error) error.textContent = message;
  }

  // Puts a copy of one of the form's message templates into one of its live regions.
  function say(form, region, name, text) {
    const box = form.querySelector('[data-form-' + region + ']');
    const template = form.querySelector('template[data-form-template="' + name + '"]');
    if (!box) return;
    box.textContent = '';
    if (!template) return;
    const copy = template.content.cloneNode(true);
    if (text && copy.firstElementChild) copy.firstElementChild.textContent = text;
    box.appendChild(copy);
  }

  // Empties a live region.
  function hush(form, region) {
    const box = form.querySelector('[data-form-' + region + ']');
    if (box) box.textContent = '';
  }

  // Writes the summary line: how many fields need fixing.
  function summarise(form, again) {
    const count = form.querySelectorAll('[aria-invalid="true"]').length;
    const box = form.querySelector('[data-form-summary]');
    if (!box) return;
    if (!count) {
      box.textContent = '';
      return;
    }
    const text = count === 1 ? form.dataset.errorsOne : count + ' ' + form.dataset.errorsMany;
    if (again || box.textContent !== text) say(form, 'summary', 'summary', text);
  }

  // Checks every control; returns the ones that need fixing.
  function checkAll(form) {
    return controlsOf(form).filter((control) => {
      const message = check(control);
      mark(control, message);
      return Boolean(message);
    });
  }

  // Sends the form and reports how it went.
  function send(form, endpoint) {
    const button = form.querySelector('[type="submit"]');
    const label = button ? button.textContent : '';
    busy.add(form);
    if (button) {
      button.setAttribute('aria-busy', 'true');
      button.textContent = form.dataset.sending || label;
    }
    fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        form.reset();
        say(form, 'status', 'success');
      })
      .catch(() => {
        say(form, 'alert', 'error');
      })
      .finally(() => {
        busy.delete(form);
        if (button) {
          button.removeAttribute('aria-busy');
          button.textContent = label;
        }
      });
  }

  // A press on the send button.
  function onSubmit(event) {
    const form = event.currentTarget;
    event.preventDefault();
    if (busy.has(form)) return;

    // A filled trap field means a robot: do nothing.
    const trap = form.querySelector('[name="_gotcha"]');
    if (trap && trap.value) return;

    hush(form, 'status');
    hush(form, 'alert');

    const wrong = checkAll(form);
    summarise(form, true);
    if (wrong.length) {
      wrong[0].focus();
      return;
    }

    // No endpoint: move to the notice that says the form is not connected, and keep what was typed.
    const endpoint = (form.dataset.endpoint || '').trim();
    if (!endpoint) {
      const notice = form.querySelector('[data-form-notice]');
      if (notice) notice.focus();
      return;
    }
    send(form, endpoint);
  }

  // While typing: a field that needed fixing is cleared once it is right. New mistakes wait for the next press, so nothing moves under a click.
  function onInput(event) {
    const form = event.currentTarget;
    const control = event.target;
    if (!control.matches('[data-error][aria-invalid="true"]')) return;
    mark(control, check(control));
    summarise(form, false);
  }

  forms.forEach((form) => {
    // The checks of this script replace the browser's own bubbles.
    form.noValidate = true;
    form.addEventListener('submit', onSubmit);
    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);
  });
})();
