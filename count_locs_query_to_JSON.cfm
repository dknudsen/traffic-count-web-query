<!--- Generate a clean feed by suppressing white space and debugging 
         information. ---><cfprocessingdirective suppresswhitespace="yes"> 
<cfsetting showdebugoutput="no"> 
<cfcontent type="text/javascript">
<!--- check for GET or POST and set parameter source accordingly --->
<cfif getHTTPRequestData().method EQ 'GET'><cfset params = URL><cfelse><cfset params = FORM></cfif>
<!--- set flag if no parameters supplied --->
<cfset isNoParamInvoke = StructCount(params) EQ 0>
<!--- set empty values for all undefined parameters to simplify later tests --->
<cfloop index="p" delimiters="," 
	list="tn,rt,st,stX,rg,fc,ft,loc,ext,type,catSum,dirSum,lnSum,adt,frm,to,rec,days,sun,mon,tue,wed,thu,fri,sat,mos,j,f,mar,apr,may,jun,jul,aug,s,o,n,d,avg,avgD,avgM,aggr,prj">
	<cfif NOT IsDefined("params." & p)><cfset params[p] = ""></cfif>
</cfloop>
<!--- decide the tables to be joined --->
<cfset isJoinRoads = (params.fc != "") OR (params.ft != "")>
<cfset isJoinCountParts = (params.catSum != "") OR (params.dirSum != "") OR (params.lnSum != "") OR (params.adt != "")>
<cfset isJoinCounts = isJoinCountParts OR (params.type != "") OR (params.frm != "") OR (params.to != "") OR (params.rec != "") OR (params.prj != "")>
<cfquery name="countLocData" datasource="counts"><cfoutput>
  SELECT 
  	count_location_id, 
	streetname, 
    auto_rte_number, 
    alt_rte_number, 
    roadinventory_id, 
    l.description, 
    l.town_id, 
    town,
    sde.st_x(shape) AS x,
    sde.st_y(shape) AS y<cfif isJoinCounts>,
    date_first,
    date_last,
    types.type,
    types.description AS type_description,
    projects.name AS project_name,
    projects.description AS project_description</cfif><cfif isJoinCountParts>,
    DECODE(direction, 1, 'N', 2, 'S', 3, 'E', 4, 'W', '') AS dir,
    lanes,
    DECODE(BITAND(lanes,1),1,'0') || DECODE(BITAND(lanes,2),2,'1') || DECODE(BITAND(lanes,4),4,'2') || DECODE(BITAND(lanes,8),8,'3') || DECODE(BITAND(lanes,16),16,'4') ||
      DECODE(BITAND(lanes,32),32,'5') || DECODE(BITAND(lanes,64),64,'6') || DECODE(BITAND(lanes,128),128,'7') || DECODE(BITAND(lanes,256),256,'8') AS lange_range,
    category_code,
    data_table,
    date_start,
    date_end,
    description(</cfif>
  FROM count_locations l, 
    towns_r_data t<cfif isJoinRoads>,
    mpodata.eot_roadinventory r</cfif><cfif isJoinCounts>,
    counts c, types, projects</cfif><cfif isJoinCountParts>,
    count_parts cp</cfif>
  WHERE l.town_id = t.town_id<cfif isJoinRoads>
    AND l.roadinventory_id = r.roadinventory_id</cfif><cfif isJoinCounts>
    AND l.count_location_id = c.count_loc_id
    AND c.type_id = types.type_id
    AND c.project_id = projects.project_id</cfif><cfif isJoinCountParts>
    AND c.count_id = cp.count_id</cfif>
    AND town = <cfif params.tn EQ "">'WAKEFIELD'<cfelse><cfoutput>'#params.tn#'</cfoutput></cfif><cfif params.rt NEQ "">
    AND auto_rte_number = '#params.rt#'</cfif><cfif params.st NEQ "">
	<cfif params.stX EQ "">AND streetname = '#params.st#'<cfelse>AND SOUNDEX(streetname) = SOUNDEX('#params.st#')</cfif></cfif><cfif params.fc NEQ "">
    AND r.functionalclassification = #params.fc#</cfif><cfif params.ft NEQ "">
    AND r.facilitytype = '#params.ft#'</cfif><cfif params.loc NEQ "">
    AND count_location_id IN (#params.loc#)</cfif><cfif params.ext NEQ "">
    AND x BETWEEN params.minX AND params.maxX AND y BETWEEN params.minY AND params.maxY</cfif><cfif params.type NEQ "">
    AND types.type = '#params.type#'</cfif><cfif params.frm NEQ "">
    AND <cfif isJoinCountParts>date_end<cfelse>date_last</cfif> > TO_DATE('#params.frm#')</cfif><cfif params.to NEQ "">
    AND <cfif isJoinCountParts>date_start<cfelse>date_first</cfif> < TO_DATE('#params.to#')</cfif><cfif params.prj NEQ "">
    AND projects.name = '#params.prj#'</cfif>
</cfoutput></cfquery>
<!--- Look-up table queries --->
<cfif isNoParamInvoke>
	<!--- TYPES --->
	<cfquery name="typeList" datasource="counts">SELECT * FROM types ORDER BY type</cfquery>
    <!--- PROJECTS --->
    <cfquery name="projectList" datasource="counts">SELECT * FROM projects ORDER BY name</cfquery>
</cfif>
<!--- TOWNS --->
<cfquery name="townList" dbtype="query">
  SELECT town, town_id FROM countLocData GROUP BY town, town_id ORDER BY town, town_id
</cfquery>
<!--- EXTENT/BOUNDING BOX --->
<cfquery name="locationExtent" dbtype="query">SELECT min(x) AS min_x, min(y) AS min_y, max(x) AS max_x, max(y) AS max_y FROM countLocData</cfquery>
<!--- DATE RANGE --->
<cfif isJoinCountParts>
	<cfquery name="dateRange" dbtype="query">SELECT min(date_start) AS min_date, max(date_end) AS max_date FROM countLocData</cfquery>
<cfelseif isJoinCounts>
	<cfquery name="dateRange" dbtype="query">SELECT min(date_first) AS min_date, max(date_last) AS max_date FROM countLocData</cfquery>
<cfelse>
	<cfquery name="dateRange" datasource="counts">SELECT min(date_first) AS min_date, max(date_last) AS max_date FROM counts</cfquery>
</cfif>
<cfoutput>{"townList":#SerializeJSON(townList)#,"locationExtent":#SerializeJSON(locationExtent)#,"dateRange":#SerializeJSON(dateRange)#,"data":#SerializeJSON(countLocData)#<cfif
  isNoParamInvoke>,"typeList":#SerializeJSON(typeList)#,"projectList":#SerializeJSON(projectList)#</cfif>}</cfoutput>
</cfprocessingdirective>