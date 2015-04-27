# traffic-count-web-query
This is a browser-based front end for accessing and visualizing data from the CTPS database of traffic counts, using geographic and tabular query methods. It is intended to provide self service data retrieval and analysis for transportation planners and engineers, but may ultimately be useful for a broader audience. The web app relies on
* jQueryUI for its form controls
* Leaflet for its map control
* ColdFusion for queries and reports on the backend database
* jQuery and JSON for asynchronous data retrieval
* d3 (prospective) for visualizing count data

The CTPS traffic count database is a normalized relational database of many different kinds of vehicle traffic counts containing millions of data rows and spanning 1962 to the present. Two normalized tables contain count header information, while counts themselves are stored in different tables depending on the time interval to which they are aggregated (for instance there is an hourly table as well as a quarter-hourly table). The geographic attributes of traffic counts are represented in an Esri point feature class stored in a the same enterprise geodatabase as the other tables, using the ST geometry spatial type. The points can thus be accessed both via Esri's ArcSDE middleware (and any spatial servers--such as Geoserver--that can connect to ArcSDE) and more directly via the ST geometry functions installed in the backend database (and thus by any servers--such as Railo--that can connect web servers to databases).
