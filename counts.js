// JavaScript Document
var CTPS = {};
CTPS.countsApp = {};

CTPS.countsApp.initSubmit = function() {
	$('#fromDateControl').datepicker({ dateFormat: "mm/dd/yy", numberOfMonths: 2 });
	$('#fromDateControl').change(CTPS.countsApp.queryOnControlChange);
	$('#toDateControl').datepicker({ dateFormat: "mm/dd/yy", numberOfMonths: 2 });
}; // CTPS.countsApp.init()

CTPS.countsApp.queryOnControlChange = function() {
	$.getJSON("count_locs_query_to_JSON.cfm",
			  $('#theForm').serialize(),
			  function (data) {
				  console.log(data);
			  });
}; // CTPS.countsApp.queryOnControlChange()
