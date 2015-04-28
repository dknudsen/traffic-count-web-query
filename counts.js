// JavaScript Document
var CTPS = {};
CTPS.countsApp = {};

CTPS.countsApp.initSubmit = function() {
	// init the map control
	CTPS.countsApp.project = proj4('PROJCS["NAD83 / Massachusetts Mainland",GEOGCS["NAD83",DATUM["North_American_Datum_1983",SPHEROID["GRS 1980",6378137,298.257222101,AUTHORITY["EPSG","7019"]],AUTHORITY["EPSG","6269"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.01745329251994328,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4269"]],UNIT["metre",1,AUTHORITY["EPSG","9001"]],PROJECTION["Lambert_Conformal_Conic_2SP"],PARAMETER["standard_parallel_1",42.68333333333333],PARAMETER["standard_parallel_2",41.71666666666667],PARAMETER["latitude_of_origin",41],PARAMETER["central_meridian",-71.5],PARAMETER["false_easting",200000],PARAMETER["false_northing",750000],AUTHORITY["EPSG","26986"],AXIS["X",EAST],AXIS["Y",NORTH]]');
	CTPS.countsApp.map = L.map('queryMapControl').setView([42.359,-71.06],11);
	L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png',
				{
					attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
					maxZoom: 18
				}).addTo(CTPS.countsApp.map);
	CTPS.countsApp.map.on('moveend', function(e) {
											  var bounds = e.target.getBounds();
											  var ll = CTPS.countsApp.project.forward([bounds.getWest(),bounds.getSouth()]);
											  var ur = CTPS.countsApp.project.forward([bounds.getEast(),bounds.getNorth()]);
											  $('#minXControl').val(ll[0]);
											  $('#maxXControl').val(ur[0]);
											  $('#minYControl').val(ll[1]);
											  $('#maxYControl').val(ur[1]);
											  CTPS.countsApp.queryOnControlChange();
											  });
	
	// init the tabular controls
	$('#townControl').autocomplete();
	$('#routeControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#streetControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#streetExactControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#regionControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#funcClassControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#facTypeControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#locIDControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#withinMapControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#typeControl').autocomplete({"minLength": 0, "delay": 0, "change": CTPS.countsApp.queryOnControlChange});
	$('#sumCatsControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#sumDirsControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#sumLanesControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#ADTAnnualControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#ADTMonthlyControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#fromDateControl').datepicker({"dateFormat": "mm/dd/yy", "numberOfMonths": 1, "changeMonth": true, "changeYear": true, "constrainInput": true,
									 "onSelect": CTPS.countsApp.queryOnControlChange});
	$('#toDateControl').datepicker({"dateFormat": "mm/dd/yy", "numberOfMonths": 1, "changeMonth": true, "changeYear": true, "constrainInput": true,
								   "onSelect": CTPS.countsApp.queryOnControlChange});
	$('#allDaysControl').on('change', function(e) {
											   if (e.target.checked) {
												   $('#daysDiv input[type=checkbox]').prop('checked',false);
												   $('#daysDiv').hide();
											   } else $('#daysDiv').show();
											   CTPS.countsApp.queryOnControlChange();
											   });
	$('#daysDiv input[type=checkbox]').on('change', function(e) {
															 if ($('#daysDiv :checked').length == 7) {
															     $('#daysDiv input[type=checkbox]').prop('checked',false);
																 $('#allDaysControl').prop('checked',true);
																 $('#daysDiv').hide();
															 }
															 CTPS.countsApp.queryOnControlChange();
															 });
	$('#allMonthsControl').on('change', function(e) {
												 if (e.target.checked) {
													 $('#monthsDiv input[type=checkbox]').prop('checked',false);
													 $('#monthsDiv').hide();
												 } else $('#monthsDiv').show();
												 CTPS.countsApp.queryOnControlChange();
												 });
	$('#monthsDiv input[type=checkbox]').on('change', function(e) {
															   if ($('#monthsDiv :checked').length == 12) {
																   $('#monthsDiv input[type=checkbox]').prop('checked',false);
																   $('#allMonthsControl').prop('checked',true);
																   $('#monthsDiv').hide();
															   }
															   CTPS.countsApp.queryOnControlChange();
															   });
	$('#hourlyControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#qtrHourlyControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#projControl').autocomplete({"minLength": 0, "delay": 0, "change": CTPS.countsApp.queryOnControlChange});
	
	$('#theForm').append('<input id="initControl" name="init" value="y" type="hidden">');
	CTPS.countsApp.queryOnControlChange();
	$('#initControl').remove();
}; // CTPS.countsApp.init()

CTPS.countsApp.queryOnControlChange = function() {
	$.getJSON("count_locs_query_to_JSON.cfm",
			  $('#theForm').serialize(),
			  function (data) {
				  CTPS.countsApp.data = data;
				  if (typeof(data.townList) !== 'undefined') $('#townControl').autocomplete("option", "source", data.townList);
				  if (typeof(data.typeList) !== 'undefined') $('#typeControl').autocomplete("option", "source", data.typeList);
				  if (typeof(data.numCats) !== 'undefined' && data.numCats > 1) {
					  $('#sumCatsDiv').show();
				  } else {
					  $('#sumCatsDiv').hide();
				  }
				  if (typeof(data.numDirs) !== 'undefined' && data.numDirs > 1) {
					  $('#sumDirsDiv').show();
			  	  } else {
					  $('#sumDirsDiv').hide();
				  }
				  if (typeof(data.numLanes) !== 'undefined' && data.numLanes > 1) {
					  $('#sumLanesDiv').show();
				  } else {
					  $('#sumLanesDiv').hide();
				  }
				  if (typeof(data.distinctType) !== 'undefined' && data.distinctType === 'ADT') {
					  $('#ADTDiv').show();
					  if (document.forms['theForm'].elements['adt'].value === '') $('#ADTAnnualControl').prop('checked',true);
				  } else {
					  $('#ADTDiv').hide();
					  $('#ADTAnnualControl').prop('checked',false);
					  $('#ADTMonthlyControl').prop('checked',false);
				  }
				  if (typeof(data.dateRange) !== 'undefined') {
					  $('#fromDateControl').val(data.dateRange.DATA.length > 0 ? $.datepicker.formatDate('mm/dd/yy',new Date(data.dateRange.DATA[0][0])) : '');
					  $('#toDateControl').val(data.dateRange.DATA.length > 0 ? $.datepicker.formatDate('mm/dd/yy',new Date(data.dateRange.DATA[0][1])) : '');
				  }
				  if (typeof(data.data_quarter_hourly) !== 'undefined') {
					  $('#aggregationIntervalDiv').show();
					  if (document.forms['theForm'].elements['aggr'].value === '') $('#hourlyControl').prop('checked',true);
				  } else {
					  $('#aggregationIntervalDiv').hide();
					  $('#hourlyControl').prop('checked',false);
					  $('#qtrHourlyControl').prop('checked',false);
				  }
				  if (typeof(data.projectList) !== 'undefined') $('#projControl').autocomplete("option", "source", data.projectList);
				  CTPS.countsApp.nest = d3.nest()
				  		.key(function(d) { return d[0] }).sortKeys(d3.ascending)
						.key(function(d) { return d[12] }).sortKeys(d3.ascending)
						.key(function(d) { return d[20] }).sortKeys(d3.ascending)
						.key(function(d) { return d[16] }).sortKeys(d3.ascending)
						.key(function(d) { return d[21] }).sortKeys(d3.ascending)
						.key(function(d) { return d[19] }).sortKeys(d3.ascending)
						.entries(CTPS.countsApp.data.data.DATA)
				  CTPS.countsApp.treeNodes = d3.layout.tree().children(function(d) { return d.values }).nodes(CTPS.countsApp.nest);
			  });
}; // CTPS.countsApp.queryOnControlChange()
