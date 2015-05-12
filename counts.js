// JavaScript Document
var CTPS = {};
CTPS.countsApp = {};
CTPS.countsApp.drawVertices = [];
CTPS.countsApp.aoi = null;

CTPS.countsApp.initSubmit = function() {
	// init the map control
	CTPS.countsApp.project = proj4('PROJCS["NAD83 / Massachusetts Mainland",GEOGCS["NAD83",DATUM["North_American_Datum_1983",SPHEROID["GRS 1980",6378137,298.257222101,AUTHORITY["EPSG","7019"]],AUTHORITY["EPSG","6269"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.01745329251994328,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4269"]],UNIT["metre",1,AUTHORITY["EPSG","9001"]],PROJECTION["Lambert_Conformal_Conic_2SP"],PARAMETER["standard_parallel_1",42.68333333333333],PARAMETER["standard_parallel_2",41.71666666666667],PARAMETER["latitude_of_origin",41],PARAMETER["central_meridian",-71.5],PARAMETER["false_easting",200000],PARAMETER["false_northing",750000],AUTHORITY["EPSG","26986"],AXIS["X",EAST],AXIS["Y",NORTH]]');
	CTPS.countsApp.wkt = new Wkt.Wkt();

	CTPS.countsApp.map = L.map('queryMapControl').setView([42.359,-71.06],11);	// initial view zoomed to MPO/modeled area
	L.tileLayer('http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="http://cartodb.com/attributions#basemaps">CartoDB</a>', maxZoom: 18})
		.addTo(CTPS.countsApp.map);		// add backdrop map
	//L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',maxZoom: 18})
		//.addTo(CTPS.countsApp.map);	// add backdrop map
	L.tileLayer.wms('http://lindalino:8080/geoserver/ctpssde/wms', {layers: 'MPODATA.CTPS_COUNT_LOCATIONS', format: 'image/png',transparent: true})
		.addTo(CTPS.countsApp.map);	// add WMS layer showing count locations
	CTPS.countsApp.mapResultLayer = L.tileLayer.wms('http://lindalino:8080/geoserver/ctpssde/wms', {
		layers: 'MPODATA.CTPS_COUNT_LOCATIONS',styles: 'traffic_counts_selected', cql_filter: 'COUNT_LOCATION_ID=0', format: 'image/png',transparent: true
		}).addTo(CTPS.countsApp.map);	// add WMS layer showing count locations found in query results

	CTPS.countsApp.map.on('click',function(e) { 
		// only on click if location is sufficiently different from last click (i.e. not the second click of a double-click)
		if (CTPS.countsApp.drawVertices.length == 0 || !CTPS.countsApp.drawVertices[CTPS.countsApp.drawVertices.length-1].equals(e.latlng)) {
			CTPS.countsApp.drawVertices.push(e.latlng);
			if (CTPS.countsApp.drawVertices.length == 1) {
				// draw first point
				CTPS.countsApp.drawShape = new L.circleMarker(e.latlng,{"radius": 8,'color': '#FF0','fillColor': '#FF0', 'clickable': false}).addTo(CTPS.countsApp.map);
			} else if (CTPS.countsApp.drawVertices.length == 2) {
				// replace first point with first edge
				CTPS.countsApp.map.removeLayer(CTPS.countsApp.drawShape);
				CTPS.countsApp.drawShape = new L.polyline(CTPS.countsApp.drawVertices,{'color': '#FF0', 'clickable': false}).addTo(CTPS.countsApp.map);
			} else if (CTPS.countsApp.drawVertices.length == 3) {
				// replace prior vector shape with polygon
				CTPS.countsApp.map.removeLayer(CTPS.countsApp.drawShape);
				CTPS.countsApp.drawShape = new L.polygon(CTPS.countsApp.drawVertices,{'color': '#FF0','fillColor': '#FF0'}).addTo(CTPS.countsApp.map);
				CTPS.countsApp.drawShape.on('dblclick', function() { 
					if (CTPS.countsApp.aoi) {
						CTPS.countsApp.aoi.off();
						CTPS.countsApp.map.removeLayer(CTPS.countsApp.aoi);
					}
					CTPS.countsApp.aoi = CTPS.countsApp.drawShape;
					CTPS.countsApp.aoi.setStyle({'color': '#2C2','fillColor': '#2C2'});
					CTPS.countsApp.aoi.off('dblclick');
					CTPS.countsApp.aoi.on('dblclick', function() {
						CTPS.countsApp.aoi.off('dblclick');
						CTPS.countsApp.map.removeLayer(CTPS.countsApp.aoi);
						CTPS.countsApp.aoi = null;
						$('#AOIControl').val('');
						CTPS.countsApp.queryOnControlChange();
					});
					CTPS.countsApp.aoi.on('click', function(e) { return false; });
					var polyProjected = new L.Polygon(CTPS.countsApp.aoi.getLatLngs().map(
						function (latlng, i, arr) { return CTPS.countsApp.project.forward([latlng.lng,latlng.lat]).reverse(); }));
					$('#AOIControl').val(CTPS.countsApp.wkt.fromObject(polyProjected).write());
					CTPS.countsApp.drawVertices = [];
					CTPS.countsApp.drawShape = null;
					CTPS.countsApp.queryOnControlChange();
				});
			} else CTPS.countsApp.drawShape.addLatLng(e.latlng); // add vertices to prior polygon
		}
	});  // set up event handler for map clicks (designate areas of interest using vector features)

	CTPS.countsApp.map.on('moveend', function(e) {
		var bounds = e.target.getBounds();
		var boundsPoly = new L.Polygon([bounds.getSouthWest(),bounds.getNorthWest(),bounds.getNorthEast(),bounds.getSouthEast()].map(function(latlng, i, arr) { 
			var lnglat = CTPS.countsApp.project.forward([latlng.lng,latlng.lat]);
			return [lnglat[1],lnglat[0]];
		}));
		$('#mapExtentControl').val(CTPS.countsApp.wkt.fromObject(boundsPoly).write());
		if (e.target.moveSource == "person" && $('#withinMapControl').prop('checked')) {
			e.target.personMoveInProgress = true;
			CTPS.countsApp.queryOnControlChange();
		}
		else e.target.moveSource = "person";
	});	// set up event handler for the map being moved

	CTPS.countsApp.map.personMoveInProgress = false;
	CTPS.countsApp.map.moveSource = "program";
	CTPS.countsApp.map.fireEvent('moveend');	// call the handler to populate the map extent form control with the current extent
	
	// init the tabular controls
	$('#queryLocControlsDiv input').on('change', CTPS.countsApp.queryOnControlChange);
	$('#queryLocControlsDiv select').on('change', CTPS.countsApp.queryOnControlChange);
	$('#queryTypeDiv input').on('change', CTPS.countsApp.queryOnControlChange);
	$('#typeControl').on('change', function(e) {
											if (e.target.value != 4) {
												$('#ADTDiv').hide();
												$('#ADTAnnualControl').prop('checked',false);
												$('#ADTMonthlyControl').prop('checked',false);
											}
											//CTPS.countsApp.queryOnControlChange;
											});
	$('#fromDateControl').datepicker({"dateFormat": "mm/dd/yy", "numberOfMonths": 1, "changeMonth": true, "changeYear": true, "constrainInput": true,
									 "onSelect": CTPS.countsApp.queryOnControlChange});
	$('#toDateControl').datepicker({"dateFormat": "mm/dd/yy", "numberOfMonths": 1, "changeMonth": true, "changeYear": true, "constrainInput": true,
								   "onSelect": CTPS.countsApp.queryOnControlChange});
	$('.nestedCheckboxes').on('change', CTPS.countsApp.toggleNestedCheckboxes);
	$('#queryTimeDiv input[type=radio]').on('change', CTPS.countsApp.queryOnControlChange);
	$('#queryProjDiv select').on('change', CTPS.countsApp.queryOnControlChange);
	
	CTPS.countsApp.queryOnControlChange();

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
	$.getJSON("counts_query_to_JSON.cfm", $('#theForm').serialize(),
		function (data) {
			CTPS.countsApp.data = data;
			if (typeof(data.count_parts) === 'undefined' || data.count_parts.DATA.length) {
				CTPS.countsApp.updateOptionList($('#townControl'),[""].concat(data.townList), 
					function(d) { return d[0] }, function(d) { return d[1] }, $('#townControl').val());
				CTPS.countsApp.updateOptionList($('#routeControl'),
												  [""].concat(data.routeList.filter(function(d) { 
														 return d.substr(0,1) >= "0" && d.substr(0,1) <= "9"
														 }).sort(function(a,b) {
															 a = "00".substr(0, 3 - String(parseInt(a)).length) + a;
															 b = "00".substr(0, 3 - String(parseInt(b)).length) + b;
															 if (a < b) return -1; 
															 if (b < a) return 1; 
															 return 0 })), 
												  function(d) { return d }, function(d) { return d }, 
												  $('#routeControl').val());
				if (document.forms['theForm'].elements['mode'].value != 'init' && $('#mapSyncControl').prop('checked')) {
					if (CTPS.countsApp.map.personMoveInProgress) CTPS.countsApp.map.personMoveInProgress = false;
					else { 
						CTPS.countsApp.map.moveSource = "program";
						CTPS.countsApp.map.fitBounds(data.geoExtent.map(function(coords, i, arr) { 
													var lnglat = CTPS.countsApp.project.inverse(coords);
													return [lnglat[1],lnglat[0]];
													}));
					}
				}
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
			}

			if (typeof(CTPS.countsApp.data.count_parts) !== 'undefined') {
				CTPS.countsApp.nest = d3.nest()
				.key(function(d) { return d[0] }).sortKeys(d3.ascending)
				.key(function(d) { return d[12] }).sortKeys(d3.ascending)
				.key(function(d) { return d[20] }).sortKeys(d3.ascending)
				.key(function(d) { return d[16] }).sortKeys(d3.ascending)
				.key(function(d) { return d[21] }).sortKeys(d3.ascending)
				.key(function(d) { return d[19] }).sortKeys(d3.ascending)
				.entries(CTPS.countsApp.data.count_parts.DATA);
				CTPS.countsApp.treeNodes = d3.layout.tree().children(function(d) { return d.values }).nodes(CTPS.countsApp.nest);
				CTPS.countsApp.mapResultLayer.setParams({'cql_filter': 'COUNT_LOCATION_ID IN (' + CTPS.countsApp.treeNodes.pop().map(function(d) { return d.key }).join() + ')'});
			} else {
				CTPS.countsApp.mapResultLayer.setParams({'cql_filter': ''});
				CTPS.countsApp.dbSize = parseInt(data.dataTableCounts.data_hourly) + parseInt(data.dataTableCounts.data_half_hourly) + 
										parseInt(data.dataTableCounts.data_quarter_hourly) +
										parseInt(data.dataTableCounts.data_monthly) + parseInt(data.dataTableCounts.data_spanning);
			}

			var respMsg, estRespPct = parseFloat(data.estRespFrac) * 100;
			respMsg = 'Total count database size: <strong>' + String(CTPS.countsApp.dbSize).replace(/\d(?=(\d{3})+$)/g, '$&,') + '</strong> rows.<br>';
			respMsg += 'Estimated rows requested: <strong>' + (estRespPct / 100 * CTPS.countsApp.dbSize).toFixed(0).replace(/\d(?=(\d{3})+$)/g, '$&,') + '</strong> (<strong>' + 
						(estRespPct).toFixed(4) + '%</strong>).<br>';
			if (typeof(CTPS.countsApp.data.count_parts) === 'undefined') {
				respMsg += 'Requests for more than 1% will be ignored.';
			} else {
				respMsg += 'Total count_part records returned: <strong>' + String(data.count_parts.DATA.length).replace(/\d(?=(\d{3})+$)/g, '$&,') + '</strong>.<br>';
				respMsg += 'Data rows estimated from count_part records: <strong>' + String(data.estDataRows).replace(/\d(?=(\d{3})+$)/g, '$&,') + '</strong>.<br>';
			}
			$('#treeControlDiv').html(respMsg);
			
			$('#responseOutputDiv').empty();
			
			for(data_table in CTPS.countsApp.data.data_tables) {
				$('#responseOutputDiv')
					.append($('<h3>').text(data_table == 'spanning' ? 'Yearly or other time span' : data_table))
					.append($('<table>')
							.append($('<thead>').append(CTPS.countsApp.data.data_tables[data_table].COLUMNS.reduce(function(prevVal, currVal) {
											return prevVal.append($('<th>').text(currVal));
											}, $('<tr>'))))
							.append(CTPS.countsApp.data.data_tables[data_table].DATA.reduce(function(preVal, currVal) {
										 return preVal.append(currVal.reduce(function(prevVal, currVal) {
																	  return prevVal.append($('<td>').text(currVal));
																	  }, $('<tr>')));
										 }, $('<tbody>'))));
			}
			
			document.forms['theForm'].elements['mode'].value = "both";
		  });
}; // CTPS.countsApp.queryOnControlChange()
