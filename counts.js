// JavaScript Document
var CTPS = {};
CTPS.countsApp = {};
CTPS.countsApp.drawVertices = [];
CTPS.countsApp.aoi = null;
CTPS.countsApp.queryThreshold = 0.01;
CTPS.countsApp.nestLevels = [];
CTPS.countsApp.fieldDict = {
	"COUNT_LOCATION_ID": {"label": "Loc. ID", "paramName": "loc"},
	"TYPE": {"label": "Type", "paramName": "type"},
	"DATA_TABLE": {"label": "Interval", "paramName": "intSel"},
	"DIR": {"label": "Dir.", "paramName": "dir"},
	"DATE_START": {"label": "Date", "paramName": "dtSt"},
	"LANE_RANGE": {"label": "Lane range", "paramName": "lr"},
	"CATEGORY_CODE": {"label": "Class", "paramName": "cat"}
}

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

	$('.leaflet-tile-pane').attr('title','Single-click to start drawing a selection polygon')
	CTPS.countsApp.map.on('click',function(e) { 
		// only on click if location is sufficiently different from last click (i.e. not the second click of a double-click)
		if (CTPS.countsApp.drawVertices.length == 0 || !CTPS.countsApp.drawVertices[CTPS.countsApp.drawVertices.length-1].equals(e.latlng)) {
			CTPS.countsApp.drawVertices.push(e.latlng);
			if (CTPS.countsApp.drawVertices.length == 1) {
				// draw first point
				CTPS.countsApp.drawShape = new L.circleMarker(e.latlng,{"radius": 8,'color': '#FF0','fillColor': '#FF0', 'clickable': false}).addTo(CTPS.countsApp.map);
				$('.leaflet-objects-pane').attr('title','Click again to add another vertex to the selection polygon')
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
						$('.leaflet-objects-pane').attr('title','Single-click to start drawing a selection polygon')
					});
					CTPS.countsApp.aoi.on('click', function(e) { return false; });
					var polyProjected = new L.Polygon(CTPS.countsApp.aoi.getLatLngs().map(
						function (latlng, i, arr) { return CTPS.countsApp.project.forward([latlng.lng,latlng.lat]).reverse(); }));
					$('#AOIControl').val(CTPS.countsApp.wkt.fromObject(polyProjected).write());
					CTPS.countsApp.drawVertices = [];
					CTPS.countsApp.drawShape = null;
					CTPS.countsApp.queryOnControlChange();
					$('.leaflet-objects-pane').attr('title','Double-click a polygon to clear it or just create a new one')
				});
				$('.leaflet-objects-pane').attr('title','Double-click to finish the selection polygon')
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
	$('#respFracThreshold').val(CTPS.countsApp.queryThreshold);
	$('#queryLocControlsDiv input').on('change', CTPS.countsApp.queryOnControlChange);
	$('#queryLocControlsDiv select').on('change', CTPS.countsApp.queryOnControlChange);
	$('#queryTypeDiv input').on('change', CTPS.countsApp.queryOnControlChange);
	$('#typeControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#fromDateControl').datepicker({"dateFormat": "mm/dd/yy", "numberOfMonths": 1, "changeMonth": true, "changeYear": true, "constrainInput": true,
									 "onSelect": CTPS.countsApp.queryOnControlChange});
	$('#fromDateControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#toDateControl').datepicker({"dateFormat": "mm/dd/yy", "numberOfMonths": 1, "changeMonth": true, "changeYear": true, "constrainInput": true,
								   "onSelect": CTPS.countsApp.queryOnControlChange});
	$('#toDateControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('#mostRecentControl').on('change', CTPS.countsApp.queryOnControlChange);
	$('.nestedCheckboxes').on('change', CTPS.countsApp.toggleNestedCheckboxes);
	$('#aggregationIntervalDiv input').on('change', function(e) {
															 if (e.target.id == "anyIntControl" && e.target.checked &&
																 (document.theForm.aggr.checked == true || document.theForm.intLimit.checked == true)) {
																 document.theForm.aggr.checked = false;
																 document.theForm.intLimit.checked = false;
															 } else if (e.target.id == "hourlyControl" && e.target.checked && 
																		(document.theForm.aggr.checked == false || document.theForm.intLimit.checked == true)) {
																 document.theForm.aggr.checked = true;
																 document.theForm.intLimit.checked = false;
															 } else if (e.target.id == "halfHourlyControl" && e.target.checked && 
																		document.theForm.aggr.checked == false && document.theForm.intLimit.checked == false) {
																 document.theForm.aggr = true;
																 document.theForm.intLimit.checked = true;
															 } else if (e.target.id == "qtrHourlyControl" && e.target.checked && 
																		(document.theForm.aggr.checked == true || document.theForm.intLimit.checked == false)) {
																 document.theForm.aggr.checked = false;
																 document.theForm.intLimit.checked = true;
															 } else if (e.target.id == "aggr" && e.target.checked && 
																		(document.theForm.intSel.value == "0" || document.theForm.intSel.value == "15")) {
																 document.theForm.intSel.value = "h";
															 } else if (e.target.id == "intLimit" && e.target.checked &&
																		(document.theForm.intSel.value == "0" || document.theForm.intSel.value == "60")) {
																 document.theForm.intSel.value = "q";
															 } else if (!document.theForm.aggr.checked && !document.theForm.intLimit.checked &&
																		document.theForm.intSel.value != "0") {
																 document.theForm.intSel.value = "0";
															 }
															 CTPS.countsApp.queryOnControlChange();
															 });
	$('#queryProjDiv select').on('change', CTPS.countsApp.queryOnControlChange);
	$('#limitToSelected').on('click', function() {
		var savedLocIDControl, savedTypeControl, savedADTElem, savedIntSelElem, savedAggrControl, savedIntLimitControl;
		return function(e) {
										selfRef = $('#' + e.target.id);
										if (selfRef.text() == "Narrow to selected") {
											savedLocIDControl = $("#locIDControl").val();
											savedTypeControl = $("#typeControl").val();
											savedADTElem = document.forms['theForm'].elements['adt'].value;
											savedIntSelElem = document.forms['theForm'].elements['intSel'].value;
											savedAggrControl = $("#aggr").prop("checked");
											savedIntLimitControl = $("#intLimit").prop("checked");
											selfRef.text("Clear restriction to selected");
											CTPS.countsApp.setFormFromSelectedNode(CTPS.countsApp.getTreeNodeKeys($(".tree-node-select")[0].parentNode.id));
										} else {
											selfRef.text("Narrow to selected");
											selfRef.prop("disabled",d3.selectAll(".tree-node-select").empty() ? "disabled" : "");
											document.forms['theForm'].elements[CTPS.countsApp.fieldDict["DIR"].paramName].value = "";
											document.forms['theForm'].elements[CTPS.countsApp.fieldDict["DATE_START"].paramName].value = "";
											document.forms['theForm'].elements[CTPS.countsApp.fieldDict["LANE_RANGE"].paramName].value = "";
											document.forms['theForm'].elements[CTPS.countsApp.fieldDict["CATEGORY_CODE"].paramName].value = "";
											$("#locIDControl").val(savedLocIDControl);
											$("#typeControl").val(savedTypeControl);
											document.forms['theForm'].elements['adt'].value = savedADTElem;
											document.forms['theForm'].elements['intSel'].value = savedIntSelElem;
											$("#aggr").prop("checked", savedAggrControl);
											$("#intLimit").prop("checked", savedIntLimitControl);
										}
										CTPS.countsApp.queryOnControlChange();
										return false;
		}
										}());
	$('#download').on('click', function(e) { 
										if ($('#download').prop('zipFile')) {
											window.open($('#download').prop('zipFile'))
										} else {
											$('#download').text('Creating...').prop('disabled','disabled');
											$('#modeControl').val('zip'); 
											CTPS.countsApp.queryOnControlChange(); 
											$('#modeControl').val('both'); 
										}
										return false;
										});
	
	CTPS.countsApp.queryOnControlChange();

}; // CTPS.countsApp.init()

CTPS.countsApp.setFormFromSelectedNode = function(selectedKeys) {
	for (key of selectedKeys) {
		if (key.key == "DIR" || key.key == "DATE_START" || key.key == "LANE_RANGE" || 
			key.key == "CATEGORY_CODE" || key.key == "COUNT_LOCATION_ID") { 
			document.forms['theForm'].elements[CTPS.countsApp.fieldDict[key.key].paramName].value = 
				(key.keyValue == "NV" ? "" : key.keyValue);
		} else if (key.key == "TYPE") {
			$("#typeControl").val($("#typeControl option").filter(function() 
				{ return this.childNodes[0] && this.childNodes[0].textContent == key.keyValue })[0].value);
		} else if (key.key == "DATA_TABLE") {
			if (key.keyValue == "spanning") document.forms['theForm'].elements['adt'].value = 'a';
			else if (key.keyValue == "monthly") document.forms['theForm'].elements['adt'].value = 'm';
			else {
				$("#aggr").prop("checked",false);
				$("#intLimit").prop("checked",false);
				if (key.keyValue == "hourly") document.forms['theForm'].elements['intSel'].value = '60';
				else if (key.keyValue == "half_hourly") document.forms['theForm'].elements['intSel'].value = '30';
				else if (key.keyValue == "quarter_hourly") document.forms['theForm'].elements['intSel'].value = '15';
			}
		}
	}
}

CTPS.countsApp.toggleNestedCheckboxes = function(e) {
	var targCheckbox = $('#' + (typeof(e) == "string" ? e : e.target.id));
	if (typeof(e) == "string") targCheckbox.prop('checked',!targCheckbox.prop('cehcked'));
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
		if (targCheckbox.prop('checked')) {
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

CTPS.countsApp.initOnScreenTimer = function() {
	CTPS.countsApp.timerRunning = true;
	$('#respStatsDiv').html('Query sent');
	window.setTimeout(CTPS.countsApp.continueOnScreenTimer, 1000);
}

CTPS.countsApp.continueOnScreenTimer = function() {
	if(CTPS.countsApp.timerRunning) {
		window.setTimeout(CTPS.countsApp.continueOnScreenTimer, 1000);
		if($('#timerElapsedSeconds').length == 0) {
			$('#respStatsDiv').html('Waiting for server response... <span id="timerElapsedSeconds">1</span>');
		} else {
			$('#respStatsDiv').html('Waiting for server response... <span id="timerElapsedSeconds">' + String(parseInt($('#timerElapsedSeconds').text(),10) + 1) + '</span>');
		}
	}
}

CTPS.countsApp.clearOnScreenTimer = function() {
	CTPS.countsApp.timerRunning = false;
	$('#respStatsDiv').html('Response received. Proceeding with additional processing.');
}

CTPS.countsApp.handleTreeNodeSelect = function(e) {
	var filteredTable, nodeKeysInCountParts, nodeKeysInData;
	var selfSelect = d3.select("#" + e.target.parentNode.id + ">.tree-node-label");
	if (selfSelect.classed("tree-node-select")) {
		selfSelect.classed("tree-node-select", false);
		$('#limitToSelected').prop("disabled","disabled");
	} else {
		d3.selectAll(".tree-node-select").classed("tree-node-select", false);
		selfSelect.classed("tree-node-select", true);
		$('#limitToSelected').prop("disabled","");
		nodeKeysInCountParts = CTPS.countsApp.getTreeNodeKeys(e.target.parentNode.id);
		if($('#limitToSelected').text() !== "Narrow to selected") CTPS.countsApp.setFormFromSelectedNode(nodeKeysInCountParts);
		if (typeof(CTPS.countsApp.data.data_tables) !== 'undefined') {
			$('#responseOutputDiv').empty();
			for (data_table in CTPS.countsApp.data.data_tables) {	
				nodeKeysInData = [];
				// node keys must be translated for data table context because keys may be in different columns in count_parts
				for (nodeKey of nodeKeysInCountParts) {
					nodeKeysInData.push( {  
						"key": nodeKey.key, 
						"keyValue": nodeKey.keyValue, 
						"col": CTPS.countsApp.data.data_tables[data_table].COLUMNS.findIndex( function(d) { return d === nodeKey.key } )
					} );
				}
				filteredTable = {
					"DATA": CTPS.countsApp.data.data_tables[data_table].DATA
						.filter(function(tableRow) {
							for (nodeKey of this.nodeKeys) {
								if ((nodeKey.keyValue === "NV" ? "" : nodeKey.keyValue) != tableRow[nodeKey.col]) return false;
							}
							return true;
						}, { "nodeKeys": nodeKeysInData } ),
					"COLUMNS": CTPS.countsApp.data.data_tables[data_table].COLUMNS
				};
				if (filteredTable.DATA.length) CTPS.countsApp.showTable(data_table, filteredTable);
			}
		}
	}
}

CTPS.countsApp.createTreeNode = function(d) {
	var newNodeExpander = document.createElement("div");
	newNodeExpander.setAttribute("class", "tree-node-expander");
	newNodeExpander.textContent = "+";
	newNodeExpander.onclick = function(e) {
			var selfSelect = $("#" + e.target.parentNode.id + ">.tree-node-expander");
			var parentSelect = d3.select("#" + e.target.parentNode.id);
			selfSelect.text((selfSelect.text() == "+") ? "-" : "+");
			parentSelect.classed("hide-children", !parentSelect.classed("hide-children"));
		};
	var newNodeLabel = document.createElement("div");
	newNodeLabel.setAttribute("class", "tree-node-label");
	// newNodeLabel.textContent = d.key;
	newNodeLabel.onclick = CTPS.countsApp.handleTreeNodeSelect;
	newNodeLabel.onmouseover = function(e) { d3.select("#" + e.target.parentNode.id + ">.tree-node-label").classed("tree-node-hilite", true)};
	newNodeLabel.onmouseout = function(e) { d3.select("#" + e.target.parentNode.id + ">.tree-node-label").classed("tree-node-hilite", false)};
	var newNode = document.createElement("div");
	newNode.appendChild(newNodeExpander);
	newNode.appendChild(newNodeLabel);
	return newNode;
}

CTPS.countsApp.updateCountPartTreeControl = function() {
	
	var keyFunctionMaker = function(i) { return function(d) { return (d[i] !== "" ? d[i] : "NV"); }; };
	var keySortFunction = function(level) {
		var colType = CTPS.countsApp.data.count_parts_col_types[CTPS.countsApp.nestLevels[level].key];
		if (colType == "VARCHAR") return d3.ascending;
		else if (colType == "NUMERIC") return function(a, b) { return Number(a.key) - Number(b.key);};
		else if (colType == "TIMESTAMP") return function(a, b) { return new Date(a.key) - new Date(b.key); };
		else return d3.ascending;
	}
	CTPS.countsApp.nest = d3.nest();
	for (key of CTPS.countsApp.nestLevels) {
		CTPS.countsApp.nest.key(keyFunctionMaker(key.col))
			.sortKeys(function(colType) {
				if ( colType == "VARCHAR") return d3.ascending;
				else if (colType == "NUMERIC") return function(a, b) { return Number(a) - Number(b); };
				else if (colType == "TIMESTAMP") return function(a, b) { return new Date(a) - new Date(b); };
				else return d3.ascending;
			}(CTPS.countsApp.data.count_parts_col_types[key.key]));
	}
	
	CTPS.countsApp.nest = CTPS.countsApp.nest.entries(CTPS.countsApp.data.count_parts.DATA);
	
	var treeNodes = d3.select("#treeControlDiv").selectAll(".tree-node-level1")
		.data(CTPS.countsApp.nest, function(d) { return d.key; });
	treeNodes.enter().append(CTPS.countsApp.createTreeNode)
			.attr("id", function(d, n) { return "tree-" + n;})
			.classed({"tree-node": true, "tree-node-level1": true, "hide-children": true});
	treeNodes.select(".tree-node-label").text(function(d) { return d.key; });
	treeNodes.exit().remove();
	treeNodes.sort(keySortFunction(0));
	for (i = 1; i < CTPS.countsApp.nestLevels.length; i++) {
		treeNodes = d3.selectAll(".tree-node-level" + i).selectAll(".tree-node-level" + (i + 1))
			.data(function(d) { return d.values; }, function(d) { return d.key; });
		treeNodes.enter().append(CTPS.countsApp.createTreeNode)
				.attr("id", function(d, n) { return this.parentNode.id + "-" + n;})
				.classed("tree-node", true)
				.classed("tree-leaf", i == CTPS.countsApp.nestLevels.length - 1)
				.classed("tree-node-level" + (i + 1), true)
				.classed("hide-children", true);
		treeNodes.select(".tree-node-label").text(function(d) { return d.key; });
		treeNodes.exit().remove();
		treeNodes.sort(keySortFunction(i));
	}
	$("#limitToSelected").prop("disabled",d3.selectAll(".tree-node-select").empty() ? "disabled" : "");
}

CTPS.countsApp.getTreeNodeKeys = function(nodeId) {
	var nodeKeys = [];
	var d3Node = d3.select("#" + nodeId);
	var className, level
	while (d3Node.classed("tree-node")) {
		className = d3Node.property("className");
		level = className.substr(className.indexOf("tree-node-level") + 15, 1) - 1;
		nodeKeys.push({
			"key": CTPS.countsApp.nestLevels[level].key,
			"col": CTPS.countsApp.nestLevels[level].col,
			"keyValue": d3Node.data()[0].key
		});
		d3Node = d3.select("#" + d3Node.property("parentNode").id);
	}
	return nodeKeys;
}

CTPS.countsApp.showHierarchy = function() {
	var hierarchyLevels = d3.select("#hierarchyDiv").selectAll(".hierarchyLevel").data(CTPS.countsApp.nestLevels);
	hierarchyLevels.enter()
		.append("div")
		.classed("hierarchyLevel", true)
		.attr( { "id": function(d, i) { return "hierarchy-level-" + i; },
				"draggable": "true",
				"ondragstart": "CTPS.countsApp.handleNestLevelDrag(event);",
				"ondragover": "CTPS.countsApp.handleNestLevelOver(event);",
				"ondrop": "CTPS.countsApp.handleNestLevelDrop(event);"
		});
	hierarchyLevels.text(function(d) { return CTPS.countsApp.fieldDict[d.key].label + " >"; });
	if (d3.select(".hierarchyLabelDiv").empty()) {
		d3.select("#hierarchyDiv")
			.append("div")
			.classed("hierarchyLabelDiv", true)
			.attr( { "id": "hierarchy-level-" + CTPS.countsApp.nestLevels.length,
					"ondragover": "CTPS.countsApp.handleNestLevelOver(event);",
					"ondrop": "CTPS.countsApp.handleNestLevelDrop(event);"
			})
			.text("Tree hierarchy (drag to reorder)");
	}
}

CTPS.countsApp.handleNestLevelDrag = function(e) {
	e.dataTransfer.setData("text/plain", e.target.id);
}

CTPS.countsApp.handleNestLevelOver = function(e) {
	e.dataTransfer.dropEffect = "move";
	e.preventDefault();
}

CTPS.countsApp.handleNestLevelDrop = function(e) {
	e.preventDefault();
	var fromLevel = e.dataTransfer.getData("text/plain").slice(-1), toLevel = e.target.id.slice(-1);
	if (fromLevel >= toLevel) {
		CTPS.countsApp.nestLevels.splice(toLevel,0,CTPS.countsApp.nestLevels.splice(fromLevel,1)[0]);
	} else { 
		CTPS.countsApp.nestLevels.splice(toLevel - 1, 0, CTPS.countsApp.nestLevels.splice(fromLevel,1)[0]); 
	}
	CTPS.countsApp.showHierarchy();
	CTPS.countsApp.updateCountPartTreeControl();
	console.log("from: " + e.dataTransfer.getData("text/plain") + "; to: " + e.target.id);
}

CTPS.countsApp.showTable = function(tableName, table) {
	strHTML = '<h3>' + (tableName == 'spanning' ? 'Yearly or other time span' : tableName) + '</h3>';
	strHTML += '<table><thead><tr>';
	for (col = 0; col < table.COLUMNS.length; col++) {
		strHTML += '<th><div class="' + table.COLUMNS[col].replace(/^[AP]M_.+$/, 'count_data') + '">' + 
					table.COLUMNS[col].replace(/_/g, ' ') + '</div></th>';
	}
	strHTML += '</tr></thead><tbody>';
	for (row = 0; row < table.DATA.length; row++) {
		strHTML += '<tr>';
		for (col = 0; col < table.DATA[row].length; col++) {
			strHTML += '<td>' + table.DATA[row][col] + '</td>';
		}
		strHTML += '</tr>';
	}
	strHTML += '</tbody></table>';
	// Note: the code below was a lot slower at rendering the huge tables needed than the straightforward loops above
	/* $('#responseOutputDiv')
		.append($('<h3>').text(data_table == 'spanning' ? 'Yearly or other time span' : data_table))
		.append($('<table>')
				.append($('<thead>').append(CTPS.countsApp.data.data_tables[data_table].COLUMNS.reduce(function(prevVal, currVal) {
								return prevVal.append($('<th>').text(currVal));
								}, $('<tr>'))))
				.append(CTPS.countsApp.data.data_tables[data_table].DATA.reduce(function(preVal, currVal) {
							 return preVal.append(currVal.reduce(function(prevVal, currVal) {
														  return prevVal.append($('<td>').text(currVal));
														  }, $('<tr>')));
							 }, $('<tbody>')))); */
	$('#responseOutputDiv').append(strHTML);
}

CTPS.countsApp.queryOnControlChange = function() {
	if (CTPS.countsApp.responsePending) {	// don't pile up requests--let control changes accumulate until previous request has a response
		CTPS.countsApp.requestsPending = true;
		return;
	}
	CTPS.countsApp.requestsPending = false;
	CTPS.countsApp.responsePending = true;
	$.getJSON("counts_query_to_JSON.cfm", $('#theForm').serialize(),
		function (data) {
			CTPS.countsApp.responsePending = false;
			CTPS.countsApp.clearOnScreenTimer();
			CTPS.countsApp.data = data;
			if (data.zipFile) {	// no data returned by query, only a reference to a zip file
				// update download button to get ZIP file
				$('#download').text(data.zipFile.substr(data.zipFile.indexOf('/')+1)).prop('zipFile',data.zipFile).prop('disabled','');
			} else {	// data returned from query
				if (data.townList && (typeof(data.count_parts) === 'undefined' || data.count_parts.DATA.length)) {
					// update query controls with new limits or lists based upon the query results
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
					if (data.dateRange.DATA.length > 0) {
						minDate = new Date(data.dateRange.DATA[0][0]);
						oldFromDate = $('#fromDateControl').datepicker("getDate");
						maxDate = new Date(data.dateRange.DATA[0][1]);
						oldToDate = $('#toDateControl').datepicker("getDate");
						if (!$('#fromDateControl').datepicker("option", "minDate")) {
							$('#fromDateControl').datepicker("option", "minDate", minDate);
							$('#fromDateControl').datepicker("option", "maxDate", maxDate);
							$('#fromDateControl').datepicker("option", "yearRange", $.datepicker.formatDate("yy", minDate) + ":" + $.datepicker.formatDate("yy", maxDate));
							$('#toDateControl').datepicker("option", "minDate", minDate);
							$('#toDateControl').datepicker("option", "maxDate", maxDate);
							$('#toDateControl').datepicker("option", "yearRange", $.datepicker.formatDate("yy", minDate) + ":" + $.datepicker.formatDate("yy", maxDate));
						}
						$('#fromDateControl').attr("placeholder", $.datepicker.formatDate('mm/dd/yy', minDate));
						if (oldFromDate) {
							$('#fromDateControl').datepicker("option", "defaultDate", (oldFromDate > minDate ? oldFromDate : minDate));
							$('#fromDateControl').val($.datepicker.formatDate('mm/dd/yy', oldFromDate));
						} else {
							$('#fromDateControl').datepicker("option", "defaultDate", minDate);
						}
						$('#toDateControl').attr("placeholder", $.datepicker.formatDate('mm/dd/yy', maxDate));
						if (oldToDate) {
							$('#toDateControl').datepicker("option", "defaultDate", (oldToDate < maxDate ? oldToDate : maxDate));
							$('#toDateControl').val($.datepicker.formatDate('mm/dd/yy', oldToDate));
						} else {
							$('#toDateControl').datepicker("option", "defaultDate", maxDate);
						}
					}
					CTPS.countsApp.updateOptionList($('#projControl'), [""].concat(data.projectList), 
													  function(d) { return d.project_name }, function(d) { return d.project_id }, 
													  $('#projControl').val());
					CTPS.countsApp.updateOptionList($('#agencyControl'), [""].concat(data.agencyList), 
													  function(d) { return d.agency }, function(d) { return d.agency_id }, 
													  $('#agencyControl').val());
					CTPS.countsApp.updateOptionList($('#clientControl'), [""].concat(data.clientList), 
													  function(d) { return d.client }, function(d) { return d.client_id }, 
													  $('#clientControl').val());
					if (typeof(data.numCats) !== 'undefined' && data.numCats > 1) $('#sumCatsDiv').show(); else { $('#sumCatsDiv').hide(); $('#sumCatsControl').prop('checked',false); }
					if (typeof(data.numDirs) !== 'undefined' && data.numDirs > 1) $('#sumDirsDiv').show(); else { $('#sumDirsDiv').hide(); $('#sumDirsControl').prop('checked',false); }
					if (typeof(data.numLanes) !== 'undefined' && data.numLanes > 1) $('#sumLanesDiv').show(); else { $('#sumLanesDiv').hide(); $('#sumLanesControl').prop('checked',false); }
					if (typeof(data.distinctType) != 'undefined' && data.distinctType === 'ADT') {
						$('#ADTDiv').show();
						if (document.forms['theForm'].elements['adt'].value === '') $('#ADTAnnualControl').prop('checked',true);
					} else {
						$('#ADTDiv').hide();
						$('#ADTAnnualControl').prop('checked',false);
						$('#ADTMonthlyControl').prop('checked',false);
					}
					if (typeof(data.data_quarter_hourly) !== 'undefined' || typeof(data.data_half_hourly) !== 'undefined' || typeof(data.data_hourly) !== 'undefined') {
						$('#dayControlsDiv').show();
					} else {
						$('#dayControlsDiv').hide();
						if (!$('#allDaysControl').prop('checked')) CTPS.countsApp.toggleNestedCheckboxes('allDaysControl');
						if (!$('#allMonthsControl').prop('checked')) CTPS.countsApp.toggleNestedCheckboxes('allMonthsControl');
						$('#avgDaysControl').prop('checked',false);
						$('#avgDaysByDOWControl').prop('checked',false);
						$('#avgDaysByMonthControl').prop('checked',false);
					}
					if (typeof(data.data_quarter_hourly) !== 'undefined' || typeof(data.data_half_hourly) !== 'undefined') {
						$('#aggregationIntervalDiv').show();
					} else {
						$('#aggregationIntervalDiv').hide();
						$('#anyIntControl').prop('checked',true);
						$('#aggr').prop('checked',false);
						$('#intLimit').prop('checked',false);
					}
					
					if (typeof(data.count_parts) === 'undefined') {
						$("#treeControlDiv").hide();
						$("#hierarchyDiv").hide();
						$("#queryFinalDataDiv").hide();
					}
					
				}
	
				if (typeof(CTPS.countsApp.data.count_parts) !== 'undefined') {
					if (CTPS.countsApp.nestLevels.length == 0) {
						for (key of ["COUNT_LOCATION_ID", "TYPE", "DATA_TABLE", "DIR", "DATE_START", "LANE_RANGE", "CATEGORY_CODE"]) {
							var col = CTPS.countsApp.data.count_parts.COLUMNS.findIndex( function(d) { return d === key } );
							if (col >= 0) CTPS.countsApp.nestLevels.push( { "key": key, "col": col } );
						}
						CTPS.countsApp.showHierarchy();
					}
					$("#queryFinalDataDiv").show();
					$("#hierarchyDiv").show();
					CTPS.countsApp.updateCountPartTreeControl();
					$("#treeControlDiv").show();
					CTPS.countsApp.mapResultLayer.setParams({'cql_filter': 'COUNT_LOCATION_ID IN (' + CTPS.countsApp.nest.map(function(d) { return d.key }).join() + ')'});
				} else {
					CTPS.countsApp.mapResultLayer.setParams({'cql_filter': ''});
					CTPS.countsApp.dbSize = parseInt(data.dataTableCounts.data_hourly) + parseInt(data.dataTableCounts.data_half_hourly) + 
											parseInt(data.dataTableCounts.data_quarter_hourly) +
											parseInt(data.dataTableCounts.data_monthly) + parseInt(data.dataTableCounts.data_spanning);
				}

				$('#download').prop('disabled',data.estRespFrac < CTPS.countsApp.queryThreshold ? '' : 'disabled');
					
				var respMsg, estRespPct = parseFloat(data.estRespFrac) * 100;
				respMsg = 'Total count database size: <strong>' + String(CTPS.countsApp.dbSize).replace(/\d(?=(\d{3})+$)/g, '$&,') + '</strong> rows.<br>';
				/* respMsg += 'Estimated rows requested: <strong>' + (estRespPct / 100 * CTPS.countsApp.dbSize).toFixed(0).replace(/\d(?=(\d{3})+$)/g, '$&,') + '</strong> (<strong>' + 
							(estRespPct).toFixed(4) + '%</strong>).<br>'; */
				if (typeof(CTPS.countsApp.data.count_parts) === 'undefined') {
					respMsg += 'Requests for more than ' + String(data.estRespFracThreshold * 100) + '% will be ignored.';
				} else {
					respMsg += 'Total count_part records returned: <strong>' + String(data.count_parts.DATA.length).replace(/\d(?=(\d{3})+$)/g, '$&,') + '</strong>.<br>';
					respMsg += 'Data rows estimated from count_part records: <strong>' + String(data.estDataRows).replace(/\d(?=(\d{3})+$)/g, '$&,') + '</strong>.<br>';
				}
				$('#respStatsDiv').html(respMsg);
				
				$('#responseOutputDiv').empty();
				
				for (data_table in CTPS.countsApp.data.data_tables) {
					CTPS.countsApp.showTable(data_table, CTPS.countsApp.data.data_tables[data_table]);
				}
				
				document.forms['theForm'].elements['mode'].value = "both";
				if (CTPS.countsApp.requestsPending) {
					CTPS.countsApp.queryOnControlChange();
				}
			}
		  }).fail(function() {
			  CTPS.countsApp.responsePending = false;
			  CTPS.countsApp.clearOnScreenTimer();
			  $('#download').val('Create download').prop('disabled','');
			  $('#respStatsDiv').html('The last query failed for some reason.');
			  $('#responseOutputDiv').empty();
		  });
	CTPS.countsApp.initOnScreenTimer();
	$('#download').text('Create download').removeProp('zipFile');
}; // CTPS.countsApp.queryOnControlChange()
