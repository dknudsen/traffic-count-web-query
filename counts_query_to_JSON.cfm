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
				   "avg,avgD,avgM,aggr,intLimit,intSel," &
				   "prj,agcy,cl," &
				   "erft">
<cfloop index="p" delimiters="," list=#paramList#>
	<cfif NOT IsDefined("params." & p)><cfset params[p] = ""></cfif>
</cfloop>
<!--- correct inconsistent params --->
<cfif params.type NEQ "4"><cfset params.adt = ""></cfif>
<!--- set an estimated response fraction threshold if not provided in parameters --->
<cfif params.erft EQ ""><cfset params.erft = 0.01></cfif>
<!--- set convenience variables --->
<cfset isGrouping = (params.catSum EQ "on") OR (params.dirSum EQ "on") OR (params.lnSum EQ "on")>
<cfset isJoinRoads = (params.fc != "") OR (params.ft != "")>

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
<cfset respFrac = respFrac * IIf(params.adt EQ "m",0.02,1) * IIf(params.intLimit EQ "on" AND params.intSel EQ "q",0.5,1)>
<!---   DATE --->
	<!---   DATE RANGE --->
	<cfset respFrac = respFrac * DateDiff("d",IIf(params.frm EQ "","CreateDate(1962,1,1)","ParseDateTime(params.frm)"),
											  IIf(params.to EQ "","Now()","ParseDateTime(params.to)")) / DateDiff("d",CreateDate(1962,1,1),Now())>
    <!---   MOST RECENT ONLY --->
	<cfset respFrac = respFrac * IIf(params.rec NEQ "",0.4,1)>
<!---   MONTH RESTRICTION --->
<cfset respFrac = respFrac * IIf(params.mos EQ "",
								 Len(params.j & params.f & params.mar & params.apr & params.may & params.jun & params.jul & params.aug & params.s & params.o & params.n & params.d)/24,1)>
<!---   PROJECT --->
<cfset respFrac = respFrac * IIf(params.prj EQ "1",0.85,IIf(params.prj EQ "2",0.13,IIf(params.prj EQ "3",0.02,IIf(params.prj NEQ "",0.01,1))))>

<!---   AGENCY --->
<cfset respFrac = respFrac * IIf(params.agcy EQ "1",0.95,IIf(params.agcy NEQ "",0.01,1))>

<!---   CLIENT --->
<cfset respFrac = respFrac * IIf(params.cl EQ "1",0.99,IIf(params.cl NEQ "",0.005,1))>

<!--- set some useful variables --->
<cfset oneMonth = CreateTimeSpan(30,0,0,0)>
<cfset oneWeek = CreateTimeSpan(7,0,0,0)>

<!--- always generate the opening brace of the JSON to be returned --->
<cfoutput>{</cfoutput>

<!--- MAIN BRANCH -- page runs different queries based upon the mode parameter --->

<cfif params.mode EQ "init" OR params.mode EQ "" OR respFrac GT params.erft>
<!--- MODE: get domains of count database; values: "init" or empty 
			As long as the fraction of the entire database estimated to be returned using the provided search parameters 
			is greater than some cut-off, don't bother performing a real query using those parameters, and just return
			parameter domains based upon full scans of single tables, i.e., town and route lists from those found in the
			count_locations table; agency, client, type, and project lists and date ranges from values found in the counts
			table, etc., etc. --->

    <!--- DOMAINS BASED on ALL LOCATIONS --->
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
    
	<!--- DOMAINS BASED on ALL COUNTS --->
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
    
    <!--- DOMAINS from FULL DATA TABLES --->
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
    <cfoutput>"geoExtent":[</cfoutput><cfoutput query="geoExtent">[#min_x#,#min_y#],[#max_x#,#max_y#]</cfoutput><cfoutput 
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
	>},"estRespFrac":#respFrac#,"estRespFracThreshold":#erft#,"querySQL":"#JSStringFormat(main_query.sql)#"</cfoutput>


<cfelse>
<!--- MODE: run parameterized queries of count database; values: not "init" or empty and respFrac <= threshold
			 Here the proportion of the whole database estimated to be returned using the provided parameters
			 in a query is less than some cut-off, so a query will be run joining all the tables necessary
			 to incorporate all the provided parameters, but still to be decided is whether to join 
			 count data tables to return count data as well, or merely return new domains for the parameters --->

	<cfif (params.mode EQ "cp" OR params.mode EQ "both") AND respFrac LTE params.erft>
	<!--- mode: get count_parts; values: "cp", "both" 
				Unless a zip file is being requested, then we always want to run a single query joining all tables
				except the count data tables, in order to find domains for all possible query parameters --->

		<!--- decide the tables to be joined --->
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
                towns_r_data t<cfif isJoinRoads>,	<!--- only join the Road Inventory if a provided query parameter requires it, since it's an expensive join --->
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
                AND l.auto_rte_number = '#params.rt#'</cfif><cfif params.st NEQ "">
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
                AND cp.date_end > TO_DATE('#params.frm#','MM/DD/YYYY')</cfif><cfif params.to NEQ "">
                AND cp.date_start < TO_DATE('#params.to#','MM/DD/YYYY')</cfif><cfif params.rec NEQ "">
                AND c.date_last = (SELECT MAX(date_last) 
                					FROM counts, count_locations 
                                    WHERE count_location_id = l.count_location_id
                                    	AND type_id = c.type_id
                                        AND project_id = c.project_id
                                        AND client = c.client
                                        AND agency = c.agency
                                    	AND count_location_id = count_loc_id<cfif params.frm NEQ "">
                                        AND date_last > TO_DATE('#params.frm#','MM/DD/YYYY')</cfif><cfif params.to NEQ "">
                                        AND date_first < TO_DATE('#params.to#','MM/DD/YYYY')</cfif>)</cfif><cfif params.prj NEQ "">
                AND c.project_id = #params.prj#</cfif><cfif params.agcy NEQ "">
				AND c.agency = #params.agcy#</cfif><cfif params.cl NEQ "">
				AND c.client = #params.cl#</cfif>
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
        <cfif isGrouping>
        	<cfquery name="cpGrouped" dbtype="query">
            	SELECT est_data_rows
                FROM cp
                GROUP BY
                    count_location_id, 
                    agency_id, client_id, type_id, project_id, date_first, date_last,<cfif params.dirSum NEQ "on">
                    dir,</cfif><cfif params.lnSum NEQ "on">
                    lanes, lange_range,</cfif><cfif params.catSum NEQ "on">
                    category_code,</cfif>
                    data_table, date_start, date_end, cp_desc,
                    est_data_rows
            </cfquery>
        </cfif>
        <cfquery name="estDataRows" dbtype="query">SELECT sum(est_data_rows) AS total_est_data_rows from cp<cfif isGrouping>Grouped</cfif></cfquery>
        
        <!--- OUTPUT the JSON --->
		<cfoutput>"geoExtent":[</cfoutput><cfoutput query="geoExtent">[#min_x#,#min_y#],[#max_x#,#max_y#]</cfoutput><cfoutput 
        >],"townList":[</cfoutput><cfoutput query="townList">["#town#",#town_id#]<cfif currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput 
        >],"routeList":[</cfoutput><cfoutput query="routeList">"#auto_rte_number#"<cfif currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput
        >],"agencyList":[</cfoutput><cfoutput query="agencyList">{"agency":"#agency#","agency_id":#agency_id#}<cfif currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput
        >],"clientList":[</cfoutput><cfoutput query="clientList">{"client":"#clientList.client#","client_id":#client_id#}<cfif currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput
        >],"typeList":[</cfoutput><cfoutput query="typeList">{"type":"#type#","type_description":"#type_description#","type_id":#type_id#}<cfif 
            currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput
        >],"projectList":[</cfoutput><cfoutput query="projectList">{"project_name":"#project_name#","project_description":"#project_description#","project_id":#project_id#}<cfif
            currentRow NEQ RecordCount>,</cfif></cfoutput><cfoutput
        >],"dateRange":#SerializeJSON(dateRange)#,"count_parts":#SerializeJSON(cp)#</cfoutput><cfoutput 
          query="distinctTables">,"data_#data_table#":true</cfoutput><cfoutput 
          query="distinctTypes"><cfif distinctTypes.RecordCount EQ 1>,"distinctType":"#type#"</cfif></cfoutput><cfoutput
        >,"numCats":#distinctCats.RecordCount#,"numDirs":#distinctDirs.RecordCount#,"numLanes":#distinctLanes.RecordCount#</cfoutput><cfoutput 
		query="estDataRows"><cfif params.mode EQ "both" AND total_est_data_rows LTE 10000><cfset params.mode = "data"></cfif>,"estDataRows":#total_est_data_rows#</cfoutput><cfoutput
		>,"estRespFrac":#respFrac#,"estRespFracThreshold":#erft#<!---,"querySQL":"#JSStringFormat(main_query.sql)#"---></cfoutput>
        
    </cfif>
    
    <cfif params.mode EQ "data" OR params.mode EQ "zip">
    <!--- mode: get data; values: "both", "data", "zip"
				The queries here are like the count_parts query above, except that they are joined to the data tables
				If the data tables in the count_parts are already known from having run the count_parts query above,
				then those are the control list for the loop. If the parameters specify the monthly or spanning data
				table, then that is used as the control list. Otherwise, the control list is all data tables.--->
		<cfif params.adt EQ "m"><cfset data_table_list = "monthly">
        <cfelseif params.adt EQ "a"><cfset data_table_list = "spanning">
        <cfelseif IsDefined("distinctTables")><cfset data_table_list = "">
        	<!--- Construct the list of data tables to query, but omit any that have a coarser time scale if a parameter requires finer time scale --->
			<cfoutput query="distinctTables"><cfif params.intLimit NEQ "on" OR 
			IIf(data_table EQ 'quarter_hourly',15,IIf(data_table EQ 'half_hourly', 30, 60)) LTE params.intSel><cfset data_table_list = data_table_list & data_table><cfif 
			currentRow NEQ RecordCount><cfset data_table_list = data_table_list & ","></cfif></cfif></cfoutput>
        <cfelse><cfset data_table_list = "hourly,half_hourly,quarter_hourly,spanning,monthly"></cfif>
        
		<!--- OUTPUT the JSON --->
		<cfif IsDefined("cp") OR IsDefined("countLocs")><cfoutput>,</cfoutput></cfif>
        <cfif params.mode NEQ "zip">	<!--- if we are not generating a zip file, output the JSON element for the data table query results object --->
            <cfoutput>"data_tables":{</cfoutput>
        <cfelse>
        	<!--- Note: currently dumping temp output to a subdirectory of the application, but it could be set to anywhere that can be determined to be relative to application directory --->
			<cfset zipFile = GetDirectoryFromPath(GetCurrentTemplatePath()) & "\temp\counts_" & DateFormat(Now(),"yyyymmdd") & TimeFormat(Now(),"HHmmssl") & ".zip">
        </cfif>

        <cfoutput><cfloop index="data_table" delimiters="," list="#data_table_list#">

            <cfquery name="data" datasource="counts" result="main_query">
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
                    projects.name AS project_name,<cfif params.dirSum NEQ "on">
                    DECODE(cp.direction, 1, 'N', 2, 'S', 3, 'E', 4, 'W', '') AS dir,</cfif><cfif params.lnSum NEQ "on"> <!--- if summing directions, omit direction col. --->
                    cp.lanes,																							<!--- if summing lanes, omit both lane-related cols. --->
                    DECODE(BITAND(cp.lanes,1),1,'0') || DECODE(BITAND(cp.lanes,2),2,'1') || DECODE(BITAND(cp.lanes,4),4,'2') || DECODE(BITAND(cp.lanes,8),8,'3') || 
                        DECODE(BITAND(cp.lanes,16),16,'4') || DECODE(BITAND(cp.lanes,32),32,'5') || DECODE(BITAND(cp.lanes,64),64,'6') || DECODE(BITAND(cp.lanes,128),128,'7') || 
                        DECODE(BITAND(cp.lanes,256),256,'8') AS lange_range,</cfif><cfif params.catSum NEQ "on">
                    cp.category_code,</cfif>																			<!--- if summing categories, omit category col. --->
                    cp.data_table,
                    d.date_start,
                    d.date_end,
                    cp.description AS cp_desc,
                    <!--- Specify the actual data columns with hard-coded lists for monthly and spanning tables and using a loop for hourly, half-hourly, and quarter-hourly tables.
						  If time interval aggregation has been specified, generate calculated roll-up data columns with aliases within the loop. --->
                    <cfif data_table EQ "spanning"><cfif isGrouping>SUM(</cfif>d.span_count<cfif isGrouping>) AS span_count</cfif><cfelseif 
					data_table EQ "monthly"><cfloop index="colMonth" list="january,february,march,april,may,june,july,august,september,october,november,december"><cfif 
					isGrouping>SUM(</cfif>d.#colMonth#<cfif isGrouping>) AS #colMonth#</cfif><cfif colMonth NEQ "december">,</cfif></cfloop><cfelse
                    ><cfif data_table EQ "hourly"><cfset interval = 60><cfelseif data_table EQ "half_hourly"><cfset interval = 30><cfelse><cfset interval = 15></cfif
                    ><cfset start_time = DateAdd("n",interval,CreateDateTime(2000,1,1,0,0,0))><cfset end_time = CreateDateTime(2000,1,2,0,0,1)
					><cfloop index="count_time" from="#start_time#" to="#end_time#" step="#CreateTimeSpan(0,0,interval,0)#"><cfif isGrouping AND 
					(params.aggr NEQ "on" OR ((DatePart("n",count_time) MOD IIf(params.intSel EQ "",60,params.intSel)) EQ (interval MOD 60)))>SUM(</cfif
                    >#TimeFormat(count_time,"tt_h")#<cfif DatePart("n",count_time) NEQ 0>#TimeFormat(count_time,"_mm")#</cfif><cfif params.aggr EQ "on" AND interval LT params.intSel
					><cfif DatePart("n",count_time) MOD params.intSel NEQ 0>+<cfelse><cfif isGrouping>)</cfif> AS #TimeFormat(count_time,"tt_h")#<cfif DatePart("n",count_time) NEQ 0
					>#TimeFormat(count_time,"_mm")#</cfif></cfif><cfelse><cfif isGrouping>) AS #TimeFormat(count_time,"tt_h")#<cfif DatePart("n",count_time) NEQ 0
					>#TimeFormat(count_time,"_mm")#</cfif></cfif></cfif><cfif end_time - count_time GT 0.0003 AND 
					(params.aggr NEQ "on" OR interval GTE params.intSel OR DatePart("n",count_time) MOD params.intSel EQ 0)>,</cfif></cfloop
                    ></cfif>
                FROM 
                    count_locations l, 
                    towns_r_data t<cfif isJoinRoads>,	<!--- only join the Road Inventory if a provided query parameter requires it, since it's an expensive join --->
                    mpodata.eot_roadinventory r</cfif>,
                    counts c, types, projects, contacts agency, contacts client,
                    count_parts cp,
                    data_#data_table# d
                WHERE 
                    l.town_id = t.town_id<cfif isJoinRoads>
                    AND l.roadinventory_id = r.roadinventory_id</cfif>
                    AND l.count_location_id = c.count_loc_id
                    AND c.agency = agency.contact_id
                    AND c.client = client.contact_id
                    AND c.type_id = types.type_id
                    AND c.project_id = projects.project_id
                    AND c.count_id = cp.count_id
					AND cp.count_part_id = d.count_part_id<cfif params.tn NEQ "">
                    AND l.town_id = #params.tn#</cfif><cfif params.rt NEQ "">
                    AND l.auto_rte_number = '#params.rt#'</cfif><cfif params.st NEQ "">
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
                    AND d.date_end > TO_DATE('#params.frm#','MM/DD/YYYY')</cfif><cfif params.to NEQ "">
                    AND d.date_start < TO_DATE('#params.to#','MM/DD/YYYY')</cfif><cfif params.rec NEQ "">
                    AND c.date_last = (SELECT MAX(date_last) 
                                        FROM counts, count_locations 
                                        WHERE count_location_id = l.count_location_id 
                                            AND type_id = c.type_id
                                            AND project_id = c.project_id
                                            AND client = c.client
                                            AND agency = c.agency
                                            AND count_location_id = count_loc_id<cfif params.frm NEQ "">
                                            AND date_last > TO_DATE('#params.frm#','MM/DD/YYYY')</cfif><cfif params.to NEQ "">
                                            AND date_first < TO_DATE('#params.to#','MM/DD/YYYY')</cfif>)</cfif><cfif params.prj NEQ "">
	                <!--- AND cp.date_end = c.date_last</cfif><cfif params.prj NEQ ""> --->
                    AND c.project_id = #params.prj#</cfif><cfif params.agcy NEQ "">
                    AND c.agency = #params.agcy#</cfif><cfif params.cl NEQ "">
                    AND c.client = #params.cl#</cfif>
                <cfif isGrouping>
                GROUP BY	<!--- include a group by clause only if summing counts across directions and/or lanes and/or categories --->
                    t.town,
                    l.town_id, 
                    l.description,
                    l.count_location_id, 
                    c.type_id,
                    c.project_id,
                    c.date_first,
                    c.date_last,<cfif params.dirSum NEQ "on">
                    DECODE(cp.direction, 1, 'N', 2, 'S', 3, 'E', 4, 'W', ''),</cfif><cfif params.lnSum NEQ "on">	<!--- if summing across directions, don't group by them --->
                    cp.lanes,																						<!--- if summing across lanes, don't group by them --->
                    DECODE(BITAND(cp.lanes,1),1,'0') || DECODE(BITAND(cp.lanes,2),2,'1') || DECODE(BITAND(cp.lanes,4),4,'2') || DECODE(BITAND(cp.lanes,8),8,'3') || 
                        DECODE(BITAND(cp.lanes,16),16,'4') || DECODE(BITAND(cp.lanes,32),32,'5') || DECODE(BITAND(cp.lanes,64),64,'6') || DECODE(BITAND(cp.lanes,128),128,'7') || 
                        DECODE(BITAND(cp.lanes,256),256,'8'),</cfif><cfif params.catSum NEQ "on">
                    cp.category_code,</cfif>																		<!--- if summing across categories, don't group by them --->
                    d.date_start,
                    l.streetname, 
                    l.auto_rte_number, 
                    l.alt_rte_number, 
                    l.roadinventory_id, 
                    sde.st_x(l.shape),
                    sde.st_y(l.shape),
                    c.agency, 
                    agency.org_name, 
                    c.client, 
                    client.org_name,
                    types.type,
                    types.description,
                    projects.name,
                    cp.data_table,
                    d.date_end,
                    cp.description
                </cfif>
                ORDER BY	<!--- make sure the data is sorted in some reasonable way --->
                	t.town, l.description, l.count_location_id,
                    c.type_id, c.project_id,
                    c.date_first, c.date_last,<cfif params.dirSum NEQ "on">
                    DECODE(cp.direction, 1, 'N', 2, 'S', 3, 'E', 4, 'W', ''),</cfif><cfif params.lnSum NEQ "on">
                    cp.lanes,</cfif><cfif params.catSum NEQ "on">
                    cp.category_code,</cfif>
                    d.date_start
            </cfquery>

			<!--- OUTPUT the JSON --->
            <cfif params.mode NEQ "zip">	<!--- if data, not a zip file, is to be returned, generate JSON from the data --->
	            "#data_table#":#SerializeJSON(data)#<cfif ListLen(data_table_list) GT 1 AND data_table NEQ ListLast(data_table_list,",")>,</cfif>
            <cfelseif data.RecordCount GT 0><!--- if a zip file is to be returned, generate CSV to be appended to zip file --->
	        	<cfset queryMetadata = getMetaData(data)>	<!--- get query's column names and data types --->
                <cfset fileoutput = "">
                <!--- write out the query column names in the first row of the output variable --->
                <cfloop index="colindex" from="1" to="#ArrayLen(queryMetadata)#"><cfif 
					colindex LT ArrayLen(queryMetadata)><cfset 
						fileoutput = fileoutput & queryMetadata[colindex].name & ","><cfelse><cfset 
						fileoutput = fileoutput & queryMetadata[colindex].name & Chr(13)></cfif 
                    ></cfloop 
                >
                <!--- write out the data rows of the query to the output variable, making sure to quote string values for the CSV format --->
				<cfoutput query="data"><cfloop 
                	index="colindex" from="1" to="#ArrayLen(queryMetadata)#"><cfif 
						queryMetadata[colindex].TypeName NEQ "NUMERIC"><cfset 
							fileoutput = fileoutput & """" & data[queryMetadata[colindex].Name] & """"><cfelse><cfset 
							fileoutput = fileoutput & data[queryMetadata[colindex].Name]></cfif 
                        ><cfif colindex NEQ ArrayLen(queryMetadata)><cfset 
							fileoutput = fileoutput & ","><cfelse><cfset 
							fileoutput = fileoutput & Chr(13)></cfif 
                        >
                    </cfloop
                ></cfoutput>
                <cfif fileoutput NEQ "">	<!--- only append to the zip file if there any query rows --->
	                <cfzip file="#zipFile#"><cfzipparam content="#fileoutput#" entrypath="#data_table#.csv"></cfzip>
                </cfif>
            </cfif>
            
		</cfloop></cfoutput> <!--- loop on all data tables implicated --->
        
        <cfif params.mode NEQ "zip">	<!--- if we are not generating a zip file, output the closing JSON brace for the data table query results object --->
	        <cfoutput>}</cfoutput>
        <cfelse>	<!--- if we are generating a zip file, the only JSON element returned will be an element providing the URL of the zip file --->
        	<!--- attempt to build a URL for the output file that is relative to the application directory --->
        	<cfset relZipURL = Replace(zipFile,'\','/','all')>
            <cfset relZipURLPart = 1>
        	<cfloop index="pathPart" from="1" to="#(ListLen(GetCurrentTemplatePath(),'\/') - 1)#">
            	<cfif relZipURLPart NEQ ListLen(relZipURL,'/')>
                	<cfif ListGetAt(GetCurrentTemplatePath(),pathPart,'\/') EQ ListGetAt(relZipURL,relZipURLPart,'/')>
                    	<cfset relZipURL = ListDeleteAt(relZipURL,relZipURLPart,'/')>
                    <cfelse>
                    	<cfset relZipURL = ListPrepend(relZipURL,'..','/')>
                        <cfset relZipURLPart = relZipURLPart + 1>
                    </cfif>
                <cfelse>
					<cfset relZipURL = ListPrepend(relZipURL,'..','/')>
                    <cfset relZipURLPart = relZipURLPart + 1>
                </cfif>
            </cfloop>
        	<cfoutput>"zipFile":"#JSStringFormat(relZipURL)#"</cfoutput>
        </cfif>
    </cfif>
    
</cfif> <!--- end main branch tests on mode --->

<!--- always generate the close brace of the JSON to be returned --->
<cfoutput>}</cfoutput>

</cfprocessingdirective>