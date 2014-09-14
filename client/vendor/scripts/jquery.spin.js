/**
 * Copyright (c) 2011-2014 Felix Gnass
 * Licensed under the MIT license
 */

/*

Basic Usage:
============

$('#el').spin(); // Creates a default Spinner using the text color of #el.
$('#el').spin({ ... }); // Creates a Spinner using the provided options.

$('#el').spin(false); // Stops and removes the spinner.

Using Presets:
==============

$('#el').spin('small'); // Creates a 'small' Spinner using the text color of #el.
$('#el').spin('large', '#fff'); // Creates a 'large' white Spinner.

Adding a custom preset:
=======================

$.fn.spin.presets.flower = {
  lines: 9
  length: 10
  width: 20
  radius: 0
}

$('#el').spin('flower', 'red');

*/

$.fn.spin = function(opts, color) {
   return this.each(function() {
    var $this = $(this),
        data = $this.data();

    if (data.spinner) {
      data.spinner.stop();
      delete data.spinner;
    }
    if (opts !== false) {
      opts = $.extend(
        { color: color || $this.css('color') },
        $.fn.spin.presets[opts] || opts
      )
      // console.log(opts);
      data.spinner = new Spinner(opts).spin(this)
      // console.log(data.spinner);
    }
  });
}

$.fn.spin.presets = {
  tiny: { lines: 8, length: 2, width: 2, radius: 3 },
  small: { lines: 8, length: 4, width: 3, radius: 5 },
  large: { lines: 10, length: 8, width: 4, radius: 8 }
}
