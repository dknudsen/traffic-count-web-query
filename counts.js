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
	$('#queryLocControlsDiv input').on('change', CTPS.countsApp.queryOnControlChange);
	$('#queryLocControlsDiv select').on('change', CTPS.countsApp.queryOnControlChange);
	$('#queryTypeDiv input').on('change', CTPS.countsApp.queryOnControlChange);
	$('#queryTypeDiv select').on('change', CTPS.countsApp.queryOnControlChange);
	$('#fromDateControl').datepicker({"dateFormat": "mm/dd/yy", "numberOfMonths": 1, "changeMonth": true, "changeYear": true, "constrainInput": true,
									 "onSelect": CTPS.countsApp.queryOnControlChange});
	$('#toDateControl').datepicker({"dateFormat": "mm/dd/yy", "numberOfMonths": 1, "changeMonth": true, "changeYear": true, "constrainInput": true,
								   "onSelect": CTPS.countsApp.queryOnControlChange});
	$('.nestedCheckboxes').on('change', CTPS.countsApp.toggleNestedCheckboxes);
	$('#queryTimeDiv input[type=radio]').on('change', CTPS.countsApp.queryOnControlChange);
	$('#queryProjDiv select').on('change', CTPS.countsApp.queryOnControlChange);
	
	CTPS.countsApp.queryOnControlChange();
	document.forms['theForm'].elements['mode'].value = "both";

}; // CTPS.countsApp.init()

CTPS.countsApp.toggleNestedCheckboxes = function(e) {
	var targCheckbox = $('#' + e.target.id);
	var isChildCheckbox = (targCheckbox.parent().has('div').length == 0);
	var nestingDiv = isChildCheckbox ? targCheckbox.parent() : targCheckbox.siblings('div');
	var nestedCheckboxes = nestingDiv.children('input[type=checkbox]');
	if (isChildCheckbox) {
		if (nestingDiv.children(':checked').length == nestedCheckboxes.length) {
			nestedCheckboxes.prop('checked',false);
			nestingDiv.siblings('input[type=checkbox]').prop('checked',true);
			nestingDiv.hide();
		}
	} else {
		if (e.target.checked) {
			nestedCheckboxes.prop('checked',false);
			nestingDiv.hide();
		} else nestingDiv.show();
	}
	CTPS.countsApp.queryOnControlChange();
}; // CTPS.countsApp.toggleNestedCheckboxes()

CTPS.countsApp.updateOptionList = function(selObj, data, optTextAccessFunc, optValAccessFunc, optValSel) {
	var oldVal = selObj.val();
	selObj.off('change');
	selObj.empty();
	for (i = 0; i < data.length; i++) {
		opt = $('<option></option>').attr('value',optValAccessFunc(data[i])).text(optTextAccessFunc(data[i]));
		if (typeof(optValSel) !== 'undefined' && optValAccessFunc(data[i]) == optValSel) opt.attr('selected','selected');
		selObj.append(opt);
	}
	selObj.on('change', CTPS.countsApp.queryOnControlChange);
	if (typeof(optValSel) !== 'undefined' && optValSel != selObj.val()) CTPS.countsApp.queryOnControlChange();
}; // CTPS.countsApp.updateOptionList

CTPS.countsApp.queryOnControlChange = function() {
	$.getJSON("counts_query_to_JSON.cfm",
			$('#theForm').serialize(),
			function (data) {
				CTPS.countsApp.data = data;
				CTPS.countsApp.updateOptionList($('#townControl'),[""].concat(data.townList), 
																			  function(d) { return d[0] }, function(d) { return d[1] }, 
																			  $('#townControl').val());
				CTPS.countsApp.updateOptionList($('#routeControl'),
												  [""].concat(data.routeList.filter(function(d) { 
																							 return d.substring(0) >= "0"&& d.substring(0) <= "9"
																							 }).sort(function(a,b) {
																								 if (isNaN(parseInt(a)) || isNaN(parseInt(b))) return b < a; 
																								 else if (parseInt(a) == parseInt(b)) b < a; 
																								 else return parseInt(b) < parseInt(a) })), 
												  function(d) { return d }, function(d) { return d }, 
												  $('#routeControl').val());
				CTPS.countsApp.updateOptionList($('#typeControl'),[""].concat(data.typeList), 
												function(d) { return d.type }, function(d) { return d.type_id }, 
												$('#typeControl').val());
				$('#fromDateControl').val(data.dateRange.DATA.length > 0 ? $.datepicker.formatDate('mm/dd/yy',new Date(data.dateRange.DATA[0][0])) : '');
				$('#toDateControl').val(data.dateRange.DATA.length > 0 ? $.datepicker.formatDate('mm/dd/yy',new Date(data.dateRange.DATA[0][1])) : '');
				CTPS.countsApp.updateOptionList($('#projControl'), [""].concat(data.projectList), 
												  function(d) { return d.project_name }, function(d) { return d.project_id }, 
												  $('#projControl').val());
				if (typeof(data.numCats) !== 'undefined' && data.numCats > 1) $('#sumCatsDiv').show(); else $('#sumCatsDiv').hide();
				if (typeof(data.numDirs) !== 'undefined' && data.numDirs > 1) $('#sumDirsDiv').show(); else $('#sumDirsDiv').hide();
				if (typeof(data.numLanes) !== 'undefined' && data.numLanes > 1) $('#sumLanesDiv').show(); else $('#sumLanesDiv').hide();
				if (typeof(data.distinctType) != 'undefined' && data.distinctType === 'ADT') {
					$('#ADTDiv').show();
					if (document.forms['theForm'].elements['adt'].value === '') $('#ADTAnnualControl').prop('checked',true);
				} else {
					$('#ADTDiv').hide();
					$('#ADTAnnualControl').prop('checked',false);
					$('#ADTMonthlyControl').prop('checked',false);
				}
				if (typeof(data.data_quarter_hourly) !== 'undefined') {
					$('#aggregationIntervalDiv').show();
					if (document.forms['theForm'].elements['aggr'].value === '') $('#hourlyControl').prop('checked',true);
				} else {
					$('#aggregationIntervalDiv').hide();
					$('#hourlyControl').prop('checked',false);
					$('#qtrHourlyControl').prop('checked',false);
				}

				if (typeof(CTPS.countsApp.data.data) !== 'undefined') {
					CTPS.countsApp.nest = d3.nest()
					.key(function(d) { return d[0] }).sortKeys(d3.ascending)
					.key(function(d) { return d[12] }).sortKeys(d3.ascending)
					.key(function(d) { return d[20] }).sortKeys(d3.ascending)
					.key(function(d) { return d[16] }).sortKeys(d3.ascending)
					.key(function(d) { return d[21] }).sortKeys(d3.ascending)
					.key(function(d) { return d[19] }).sortKeys(d3.ascending)
					.entries(CTPS.countsApp.data.data.DATA);
					CTPS.countsApp.treeNodes = d3.layout.tree().children(function(d) { return d.values }).nodes(CTPS.countsApp.nest);
				} else
					CTPS.countsApp.dbSize = parseInt(data.dataTableCounts.data_hourly) + parseInt(data.dataTableCounts.data_half_hourly) + 
											parseInt(data.dataTableCounts.data_quarter_hourly) +
											parseInt(data.dataTableCounts.data_monthly) + parseInt(data.dataTableCounts.data_spanning);

				var respMsg, estRespPct = parseFloat(data.estRespFrac) * 100;
				respMsg = 'Total count database size: <strong>' + String(CTPS.countsApp.dbSize) + '</strong> rows.<br>';
				respMsg += 'Estimated rows requested: <strong>' + String(estRespPct / 100 * CTPS.countsApp.dbSize) + '</strong> (<strong>' + 
							String(estRespPct) + '%</strong>).<br>';
				if (typeof(CTPS.countsApp.data.data) === 'undefined') {
					respMsg += 'Requests for more than 1% will be ignored.';
				} else {
					respMsg += 'Total count_part records returned: <strong>' + String(data.data.DATA.length) + '</strong>.<br>';
					respMsg += 'Data rows estimated from count_part records: <strong>' + String(data.estDataRows) + '</strong>.<br>';
				}
				$('#treeControlDiv').html(respMsg);
			  });
}; // CTPS.countsApp.queryOnControlChange()
