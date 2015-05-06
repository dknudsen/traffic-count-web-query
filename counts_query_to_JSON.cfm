<!--- Generate a clean feed by suppressing white space and debugging 
         information. ---><cfprocessingdirective suppresswhitespace="yes"> 
<cfsetting showdebugoutput="no"> 
<cfcontent type="text/javascript">

<!--- check for GET or POST and set parameter source accordingly --->
<cfif getHTTPRequestData().method EQ 'GET'><cfset params = URL><cfelse><cfset params = FORM></cfif>

<!--- set flag if no parameters supplied --->
<cfset isNoParamInvoke = StructCount(params) EQ 0>

<!--- set empty values for all undefined parameters to simplify later tests --->
<cfset paramList = "mode,tn,rt,st,stX,rg,fc,ft,loc,ext,mapX,aoi" &
				   "type,catSum,dirSum,lnSum,adt," &
				   "frm,to,rec," &
				   "days,sun,mon,tue,wed,thu,fri,sat," &
				   "mos,j,f,mar,apr,may,jun,jul,aug,s,o,n,d," &
				   "avg,avgD,avgM,aggr," &
				   "prj,agcy,cl">
<cfloop index="p" delimiters="," list=#paramList#>
	<cfif NOT IsDefined("params." & p)><cfset params[p] = ""></cfif>
</cfloop>

<!--- estimate size of response recordset --->
<!---   TOWN, ROUTE, STREET --->
<cfset respFrac = 1 * IIf(params.tn EQ "",1,0.003) * IIf(params.rt EQ "",1,0.005) * IIf(params.st EQ "",1,0.0002)>
<!---   FUNCTIONAL CLASSIFICATION --->
<cfset respFrac = respFrac * IIf(params.fc EQ "1" OR params.fc EQ "2" OR params.fc EQ "3" OR params.fc EQ "5",0.2,1) * IIf(params.fc EQ "6",0.06,1) * IIf(params.fc EQ "0",0.02,1)>
<!---   FACILITY TYPE --->
<cfset respFrac = respFrac * IIf(params.ft EQ "1",0.9,IIf(params.ft EQ "7",0.01,IIf(params.ft NEQ "",0.001,1)))>
<!---   LOCATION IDs --->
<cfset respFrac = respFrac * IIf(params.loc EQ "",1,(ArrayLen(REMatch(",",params.loc))+1)/14000)>
<!---   GEOGRAPHIC AREA --->
<cfif params.aoi NEQ "" OR (params.ext NEQ "" AND params.mapX NEQ "")>
	<cfquery name="geoArea" datasource="counts"><cfoutput>SELECT sde.st_area(<cfif params.aoi NEQ "" AND params.mapX NEQ "">sde.st_intersection(</cfif><cfif 
																				   params.mapX NEQ "">sde.st_geometry('#params.mapX#',19)</cfif><cfif 
																				   params.aoi NEQ "" AND params.mapX NEQ "">,</cfif><cfif
																				   params.aoi NEQ "">sde.st_geometry('#params.aoi#',19)</cfif><cfif
                                                                                   params.aoi NEQ "" AND params.mapX NEQ "">)</cfif>) AS geo_area FROM dual</cfoutput></cfquery>
    <cfoutput query="geoArea"><cfset respFrac = respFrac * IIf(geo_area GTE 27336000000, 1, geo_area / 27336000000)></cfoutput>
</cfif>
<!---   COUNT TYPE --->
<cfset respFrac = respFrac * IIf(params.type EQ "1" OR params.type EQ "2",0.35,IIf(params.type EQ "3" OR params.type EQ "4",0.15,IIf(params.type NEQ "",0.01,1)))>
<!---   DATA TABLE RESTRICTION --->
<cfset respFrac = respFrac * IIf(params.adt EQ "m",0.02,1) * IIf(params.aggr EQ "q",0.5,1)>
<!---   DATE RANGE --->
<cfset respFrac = respFrac * DateDiff("d",IIf(params.frm EQ "","CreateDate(1962,1,1)","ParseDateTime(params.frm)"),
										  IIf(params.to EQ "","Now()","ParseDateTime(params.to)")) / DateDiff("d",CreateDate(1962,1,1),Now())>
<!---   MONTH RESTRICTION --->
<cfset respFrac = respFrac * IIf(params.mos EQ "",
								 Len(params.j & params.f & params.mar & params.apr & params.may & params.jun & params.jul & params.aug & params.s & params.o & params.n & params.d)/24,1)>
<!---   PROJECT --->
<cfset respFrac = respFrac * IIf(params.prj EQ "1",0.85,IIf(params.prj EQ "2",0.13,IIf(params.prj EQ "3",0.02,IIf(params.prj NEQ "",0.01,1))))>

<!--- set some useful variables --->
<cfset oneMonth = CreateTimeSpan(30,0,0,0)>
<cfset oneWeek = CreateTimeSpan(7,0,0,0)>

<!--- MAIN BRANCH -- page runs different queries based upon the mode parameter --->
<!--- mode: get domains of count database; values: "init" or empty --->
<cfif params.mode EQ "init" OR params.mode EQ "" OR respFrac GT 0.01>

    <!--- LOCATION-BASED DOMAINS --->
    <cfquery name="countLocs" datasource="counts" cachedwithin="#oneWeek#">
    	SELECT auto_rte_number, l.town_id, t.town, sde.st_x(shape) AS x, sde.st_y(shape) AS y 
        FROM count_locations l, towns_r_data t 
        WHERE l.town_id = t.town_id
    </cfquery>
        <!--- GEO EXTENT --->
        <cfquery name="geoExtent" dbtype="query">SELECT min(x) AS min_x, min(y) AS min_y, max(x) AS max_x, max(y) AS max_y FROM countLocs</cfquery>
        <!--- TOWNS --->
        <cfquery name="townList" dbtype="query">SELECT town, town_id FROM countLocs GROUP BY town, town_id ORDER BY town</cfquery>
		<!--- ROUTES --->
        <cfquery name="routeList" dbtype="query">
            SELECT auto_rte_number 
            FROM countLocs 
            <!---WHERE ascii(substring(auto_rte_number)) BETWEEN 48 AND 57 --->
            GROUP BY auto_rte_number
        </cfquery>
    
	<!--- COUNT-BASED DOMAINS --->
    <cfquery name="counts" datasource="counts" result="main_query" cachedwithin="#oneWeek#">
    	SELECT 
        	agency AS agency_id, agency.org_name AS agency, client AS client_id, client.org_name AS client,
            c.project_id, p.name AS project_name, p.description AS project_description,
            c.type_id, t.type, t.description AS type_description,
            date_first, date_last
        FROM counts c, contacts agency, contacts client, projects p, types t
        WHERE
        	c.agency = agency.contact_id AND
            c.client = client.contact_id AND
            c.project_id = p.project_id AND
            c.type_id = t.type_id
    </cfquery>
    	<!--- AGENCIES --->
        <cfquery name="agencyList" dbtype="query">
        	SELECT agency_id, agency FROM counts GROUP BY agency, agency_id ORDER BY agency, agency_id
        </cfquery>
    	<!--- CLIENTS --->
        <cfquery name="clientList" dbtype="query">
        	SELECT client_id, client FROM counts GROUP BY client, client_id ORDER BY client, client_id
        </cfquery>
		<!--- TYPES --->
        <cfquery name="typeList" dbtype="query">
        	SELECT type_id, type, type_description 
            FROM counts 
            GROUP BY type, type_description, type_id
            ORDER BY type, type_description, type_id
        </cfquery>
        <!--- PROJECTS --->
        <cfquery name="projectList" dbtype="query">
        	SELECT project_id, project_name, project_description
            FROM counts
            GROUP BY project_name, project_description, project_id
            ORDER BY project_name, project_description, project_id
        </cfquery>
		<!--- DATES --->
        <cfquery name="dateRange" dbtype="query">SELECT min(date_first) AS min_date, max(date_last) AS max_date FROM counts</cfquery>
    
    <!--- DATA-TABLE-BASED DOMAINS --->
    	<!--- COUNT_PARTS --->
        <cfquery name="cpRows" datasource="counts" cachedwithin="#oneMonth#">SELECT count(*) AS cpRows from count_parts</cfquery>
        <!--- DATA_HOURLY --->
        <cfquery name="hRows" datasource="counts" cachedwithin="#oneMonth#">SELECT count(*) AS hRows from data_hourly</cfquery>
        <!--- DATA_HALF_HOURLY --->
        <cfquery name="hhRows" datasource="counts" cachedwithin="#oneMonth#">SELECT count(*) AS hhRows from data_half_hourly</cfquery>
        <!--- DATA_QUARTER_HOURLY --->
        <cfquery name="qhRows" datasource="counts" cachedwithin="#oneMonth#">SELECT count(*) AS qhRows from data_quarter_hourly</cfquery>
        <!--- DATA_MONTHLY --->
        <cfquery name="mRows" datasource="counts" cachedwithin="#oneMonth#">SELECT count(*) AS mRows from data_monthly</cfquery>
        <!--- DATA_SPANNING --->
        <cfquery name="sRows" datasource="counts" cachedwithin="#oneMonth#">SELECT count(*) AS sRows from data_spanning</cfquery>

	<!--- OUTPUT the JSON --->
    <cfoutput>{"geoExtent":[</cfoutput><cfoutput query="geoExtent">[#min_x#,#min_y#],[#max_x#,#max_y#]</cfoutput><cfoutput 
    >],"townList":[</cfoutput><cfoutput query="townList">["#town#",#town_id#]<cfif currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput 
	>],"routeList":[</cfoutput><cfoutput query="routeList">"#auto_rte_number#"<cfif currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput
	>],"agencyList":[</cfoutput><cfoutput query="agencyList">{"agency":"#agency#","agency_id":#agency_id#}<cfif currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput
	>],"clientList":[</cfoutput><cfoutput query="clientList">{"client":"#clientList.client#","client_id":#client_id#}<cfif currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput
	>],"typeList":[</cfoutput><cfoutput query="typeList">{"type":"#type#","type_description":"#type_description#","type_id":#type_id#}<cfif 
		currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput
	>],"projectList":[</cfoutput><cfoutput query="projectList">{"project_name":"#project_name#","project_description":"#project_description#","project_id":#project_id#}<cfif
		currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput
	>],"dateRange":#SerializeJSON(dateRange)#,"dataTableCounts":{</cfoutput><cfoutput query="cpRows">"count_parts":#cpRows#,</cfoutput><cfoutput 
		query="hRows">"data_hourly":#hRows#,</cfoutput><cfoutput
		query="hhRows">"data_half_hourly":#hhRows#,</cfoutput><cfoutput
		query="qhRows">"data_quarter_hourly":#qhRows#,</cfoutput><cfoutput
		query="mRows">"data_monthly":#mRows#,</cfoutput><cfoutput
		query="sRows">"data_spanning":#sRows#</cfoutput><cfoutput
	>},"estRespFrac":#respFrac#,"querySQL":"#JSStringFormat(main_query.sql)#"}</cfoutput>

<!--- mode: run parameterized queries of count database; values: not "init" or empty --->
<cfelse>

	<!--- mode: get count_parts; values: "cp", "both" --->
	<cfif (params.mode EQ "cp" OR params.mode EQ "both") AND respFrac LTE 0.01>

		<!--- decide the tables to be joined --->
        <cfset isJoinRoads = (params.fc != "") OR (params.ft != "")>
        <cfset isJoinCountParts = (params.catSum != "") OR (params.dirSum != "") OR (params.lnSum != "") OR (params.adt != "" OR True)>
        <cfset isJoinCounts = isJoinCountParts OR (params.type != "") OR (params.frm != "") OR (params.to != "") OR (params.rec != "") OR (params.prj != "")>
        <cfquery name="cp" datasource="counts" result="main_query"><cfoutput>
            SELECT 
                l.count_location_id, 
                l.streetname, 
                l.auto_rte_number, 
                l.alt_rte_number, 
                l.roadinventory_id, 
                l.description AS loc_desc, 
                l.town_id, 
                t.town,
                sde.st_x(l.shape) AS x,
                sde.st_y(l.shape) AS y,
                c.agency AS agency_id, 
                agency.org_name AS agency, 
                c.client AS client_id, 
                client.org_name AS client,
                c.type_id,
                c.project_id,
                c.date_first,
                c.date_last,
                types.type,
                types.description AS type_description,
                projects.name AS project_name,
                projects.description AS project_description,
                DECODE(cp.direction, 1, 'N', 2, 'S', 3, 'E', 4, 'W', '') AS dir,
                cp.lanes,
                DECODE(BITAND(cp.lanes,1),1,'0') || DECODE(BITAND(cp.lanes,2),2,'1') || DECODE(BITAND(cp.lanes,4),4,'2') || DECODE(BITAND(cp.lanes,8),8,'3') || 
                    DECODE(BITAND(cp.lanes,16),16,'4') || DECODE(BITAND(cp.lanes,32),32,'5') || DECODE(BITAND(cp.lanes,64),64,'6') || DECODE(BITAND(cp.lanes,128),128,'7') || 
                    DECODE(BITAND(cp.lanes,256),256,'8') AS lange_range,
                cp.category_code,
                cp.data_table,
                cp.date_start,
                cp.date_end,
                cp.description AS cp_desc,
                DECODE(c.type_id,4,EXTRACT(YEAR FROM cp.date_end) - EXTRACT(YEAR FROM cp.date_start) + 1,
                    TRUNC(cp.date_end) - TRUNC(cp.date_start) + 1) AS est_data_rows
            FROM 
                count_locations l, 
                towns_r_data t<cfif isJoinRoads>,
                mpodata.eot_roadinventory r</cfif>,
                counts c, types, projects, contacts agency, contacts client,
                count_parts cp
            WHERE 
                l.town_id = t.town_id<cfif isJoinRoads>
                AND l.roadinventory_id = r.roadinventory_id</cfif>
                AND l.count_location_id = c.count_loc_id
                AND c.agency = agency.contact_id
                AND c.client = client.contact_id
                AND c.type_id = types.type_id
                AND c.project_id = projects.project_id
                AND c.count_id = cp.count_id<cfif params.tn NEQ "">
                AND l.town_id = #params.tn#</cfif><cfif params.rt NEQ "">
                AND auto_rte_number = '#params.rt#'</cfif><cfif params.st NEQ "">
                <cfif params.stX NEQ "">AND l.streetname = UPPER('#params.st#')<cfelse>AND SOUNDEX(l.streetname) = SOUNDEX('#params.st#')</cfif></cfif><cfif params.fc NEQ "">
                AND r.functionalclassification = #params.fc#</cfif><cfif params.ft NEQ "">
                AND r.facilitytype = '#params.ft#'</cfif><cfif params.loc NEQ "">
                AND l.count_location_id IN (#params.loc#)</cfif><cfif params.aoi NEQ "" OR (params.ext NEQ "" AND params.mapX NEQ "")>
                AND sde.st_intersects(l.shape, <cfif params.aoi NEQ "" AND params.mapX NEQ "">sde.st_intersection(</cfif><cfif
                									 params.mapX NEQ "">sde.st_geometry('#params.mapX#', 19)</cfif><cfif
                                                     params.aoi NEQ "" AND params.mapX NEQ "">,</cfif><cfif
                                                     params.aoi NEQ "">sde.st_geometry('#params.aoi#', 19)</cfif><cfif
                                                     params.aoi NEQ "" AND params.mapX NEQ "">)</cfif>) = 1</cfif><cfif params.type NEQ "">
                AND c.type_id = #params.type#</cfif><cfif params.adt NEQ "">
                AND cp.data_table = '<cfif params.adt EQ "a">spanning<cfelse>monthly</cfif>'</cfif><cfif params.frm NEQ "">
                AND date_end > TO_DATE('#params.frm#','MM/DD/YYYY')</cfif><cfif params.to NEQ "">
                AND date_start < TO_DATE('#params.to#','MM/DD/YYYY')</cfif><cfif params.prj NEQ "">
                AND c.project_id = #params.prj#</cfif>
        </cfoutput></cfquery>

	    <!--- QUERY-BASED DOMAINS --->
        <!--- GEO EXTENT --->
        <cfquery name="geoExtent" dbtype="query">SELECT min(x) AS min_x, min(y) AS min_y, max(x) AS max_x, max(y) AS max_y FROM cp</cfquery>
        <!--- TOWNS --->
        <cfquery name="townList" dbtype="query">SELECT town, town_id FROM cp GROUP BY town, town_id ORDER BY town</cfquery>
		<!--- ROUTES --->
        <cfquery name="routeList" dbtype="query">
            SELECT auto_rte_number 
            FROM cp 
            <!---WHERE ascii(substring(auto_rte_number)) BETWEEN 48 AND 57 --->
            GROUP BY auto_rte_number
        </cfquery>
    	<!--- AGENCIES --->
        <cfquery name="agencyList" dbtype="query">
        	SELECT agency_id, agency FROM cp GROUP BY agency, agency_id ORDER BY agency, agency_id
        </cfquery>
    	<!--- CLIENTS --->
        <cfquery name="clientList" dbtype="query">
        	SELECT client_id, client FROM cp GROUP BY client, client_id ORDER BY client, client_id
        </cfquery>
		<!--- TYPES --->
        <cfquery name="typeList" dbtype="query">
        	SELECT type_id, type, type_description FROM cp GROUP BY type, type_description, type_id ORDER BY type, type_description, type_id
        </cfquery>
        <!--- PROJECTS --->
        <cfquery name="projectList" dbtype="query">
        	SELECT project_id, project_name, project_description
            FROM cp
            GROUP BY project_name, project_description, project_id
            ORDER BY project_name, project_description, project_id
        </cfquery>
		<!--- DATES --->
        <cfquery name="dateRange" dbtype="query">SELECT min(date_start) AS min_date, max(date_end) AS max_date FROM cp</cfquery>
        <!--- DISTINCT CATEGORIES, DIRECTIONS, LANES, DATA_TABLES --->
        <cfquery name="distinctTypes" dbtype="query">SELECT type from cp GROUP BY type</cfquery>
        <cfquery name="distinctCats" dbtype="query">SELECT category_code FROM cp GROUP BY category_code</cfquery>
        <cfquery name="distinctDirs" dbtype="query">SELECT dir FROM cp GROUP BY dir</cfquery>
        <cfquery name="distinctLanes" dbtype="query">SELECT lanes from cp GROUP BY lanes</cfquery>
        <cfquery name="distinctTables" dbtype="query">SELECT data_table from cp GROUP BY data_table</cfquery>
        <!--- DATA ROW ESTIMATE --->
        <cfquery name="estDataRows" dbtype="query">SELECT sum(est_data_rows) AS total_est_data_rows from cp</cfquery>
        
        <!--- OUTPUT the JSON --->
		<cfoutput>{"geoExtent":[</cfoutput><cfoutput query="geoExtent">[#min_x#,#min_y#],[#max_x#,#max_y#]</cfoutput><cfoutput 
        >],"townList":[</cfoutput><cfoutput query="townList">["#town#",#town_id#]<cfif currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput 
        >],"routeList":[</cfoutput><cfoutput query="routeList">"#auto_rte_number#"<cfif currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput
        >],"agencyList":[</cfoutput><cfoutput query="agencyList">{"agency":"#agency#","agency_id":#agency_id#}<cfif currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput
        >],"clientList":[</cfoutput><cfoutput query="clientList">{"client":"#clientList.client#","client_id":#client_id#}<cfif currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput
        >],"typeList":[</cfoutput><cfoutput query="typeList">{"type":"#type#","type_description":"#type_description#","type_id":#type_id#}<cfif 
            currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput
        >],"projectList":[</cfoutput><cfoutput query="projectList">{"project_name":"#project_name#","project_description":"#project_description#","project_id":#project_id#}<cfif
            currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput
        >],"dateRange":#SerializeJSON(dateRange)#,"data":#SerializeJSON(cp)#</cfoutput><cfoutput 
          query="distinctTables">,"data_#data_table#":true</cfoutput><cfoutput 
          query="distinctTypes"><cfif distinctTypes.RecordCount EQ 1>,"distinctType":"#type#"</cfif></cfoutput><cfoutput
        >,"numCats":#distinctCats.RecordCount#,"numDirs":#distinctDirs.RecordCount#,"numLanes":#distinctLanes.RecordCount#</cfoutput><cfoutput 
		query="estDataRows">,"estDataRows":#total_est_data_rows#</cfoutput><cfoutput>,"estRespFrac":#respFrac#<!---,"querySQL":"#JSStringFormat(main_query.sql)#"--->}</cfoutput>

    </cfif>
    
    <!--- mode: get data; values: "both", "data", "zip" --->
    <cfif params.mode EQ "both" OR params.mode EQ "data" OR params.mode EQ "zip">
    </cfif>
    
</cfif> <!--- end main branch tests on mode --->

</cfprocessingdirective>