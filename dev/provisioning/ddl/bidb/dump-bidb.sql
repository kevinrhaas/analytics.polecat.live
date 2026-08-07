--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7 (Homebrew)

-- Started on 2026-02-06 09:51:46 CST

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 16 (class 2615 OID 16423)
-- Name: bidb_ext; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA bidb_ext;

--
-- TOC entry 2 (class 3079 OID 16442)
-- Name: postgres_fdw; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgres_fdw WITH SCHEMA bidb_ext;


--
-- TOC entry 5301 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION postgres_fdw; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgres_fdw IS 'foreign-data wrapper for remote PostgreSQL servers';


--
-- TOC entry 538 (class 1255 OID 180732)
-- Name: get_data_multiplier(); Type: FUNCTION; Schema: bidb_ext; Owner: -
--

CREATE FUNCTION bidb_ext.get_data_multiplier() RETURNS numeric
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT 1::numeric;  
  $$;


--
-- TOC entry 482 (class 1259 OID 183824)
-- Name: SequelizeMeta; Type: FOREIGN TABLE; Schema: bidb_ext; Owner: -
--

CREATE FOREIGN TABLE bidb_ext."SequelizeMeta" (
    name character varying(255) NOT NULL
)
SERVER remote_bidb
OPTIONS (
    schema_name 'bidb',
    table_name 'SequelizeMeta'
);
ALTER FOREIGN TABLE ONLY bidb_ext."SequelizeMeta" ALTER COLUMN name OPTIONS (
    column_name 'name'
);


--
-- TOC entry 483 (class 1259 OID 183827)
-- Name: applications_policies_view; Type: FOREIGN TABLE; Schema: bidb_ext; Owner: -
--

CREATE FOREIGN TABLE bidb_ext.applications_policies_view (
    _id bigint NOT NULL,
    "ApplicationId" text,
    "PolicyId" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'bidb',
    table_name 'applications_policies_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext.applications_policies_view ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext.applications_policies_view ALTER COLUMN "ApplicationId" OPTIONS (
    column_name 'ApplicationId'
);
ALTER FOREIGN TABLE ONLY bidb_ext.applications_policies_view ALTER COLUMN "PolicyId" OPTIONS (
    column_name 'PolicyId'
);


--
-- TOC entry 484 (class 1259 OID 183830)
-- Name: applications_summary_view; Type: FOREIGN TABLE; Schema: bidb_ext; Owner: -
--

CREATE FOREIGN TABLE bidb_ext.applications_summary_view (
    _id text NOT NULL,
    "Name" text,
    "Type" text,
    "Parent" text,
    "Fqdn" text,
    "UsersWithAccess" jsonb
)
SERVER remote_bidb
OPTIONS (
    schema_name 'bidb',
    table_name 'applications_summary_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext.applications_summary_view ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext.applications_summary_view ALTER COLUMN "Name" OPTIONS (
    column_name 'Name'
);
ALTER FOREIGN TABLE ONLY bidb_ext.applications_summary_view ALTER COLUMN "Type" OPTIONS (
    column_name 'Type'
);
ALTER FOREIGN TABLE ONLY bidb_ext.applications_summary_view ALTER COLUMN "Parent" OPTIONS (
    column_name 'Parent'
);
ALTER FOREIGN TABLE ONLY bidb_ext.applications_summary_view ALTER COLUMN "Fqdn" OPTIONS (
    column_name 'Fqdn'
);
ALTER FOREIGN TABLE ONLY bidb_ext.applications_summary_view ALTER COLUMN "UsersWithAccess" OPTIONS (
    column_name 'UsersWithAccess'
);


--
-- TOC entry 485 (class 1259 OID 183833)
-- Name: applications_terms_view; Type: FOREIGN TABLE; Schema: bidb_ext; Owner: -
--

CREATE FOREIGN TABLE bidb_ext.applications_terms_view (
    _id bigint NOT NULL,
    "ApplicationId" text,
    "TermId" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'bidb',
    table_name 'applications_terms_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext.applications_terms_view ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext.applications_terms_view ALTER COLUMN "ApplicationId" OPTIONS (
    column_name 'ApplicationId'
);
ALTER FOREIGN TABLE ONLY bidb_ext.applications_terms_view ALTER COLUMN "TermId" OPTIONS (
    column_name 'TermId'
);


--
-- TOC entry 486 (class 1259 OID 183836)
-- Name: checksum_aggregated_view; Type: FOREIGN TABLE; Schema: bidb_ext; Owner: -
--

CREATE FOREIGN TABLE bidb_ext.checksum_aggregated_view (
    _id text NOT NULL,
    "duplicateFilesCount" integer,
    "duplicateFilesSize" bigint
)
SERVER remote_bidb
OPTIONS (
    schema_name 'bidb',
    table_name 'checksum_aggregated_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext.checksum_aggregated_view ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext.checksum_aggregated_view ALTER COLUMN "duplicateFilesCount" OPTIONS (
    column_name 'duplicateFilesCount'
);
ALTER FOREIGN TABLE ONLY bidb_ext.checksum_aggregated_view ALTER COLUMN "duplicateFilesSize" OPTIONS (
    column_name 'duplicateFilesSize'
);


--
-- TOC entry 487 (class 1259 OID 183839)
-- Name: currency_exchange_rates; Type: FOREIGN TABLE; Schema: bidb_ext; Owner: -
--

CREATE FOREIGN TABLE bidb_ext.currency_exchange_rates (
    currency_symbol text NOT NULL,
    "ConversionRateToUSD" double precision
)
SERVER remote_bidb
OPTIONS (
    schema_name 'bidb',
    table_name 'currency_exchange_rates'
);
ALTER FOREIGN TABLE ONLY bidb_ext.currency_exchange_rates ALTER COLUMN currency_symbol OPTIONS (
    column_name 'currency_symbol'
);
ALTER FOREIGN TABLE ONLY bidb_ext.currency_exchange_rates ALTER COLUMN "ConversionRateToUSD" OPTIONS (
    column_name 'ConversionRateToUSD'
);


--
-- TOC entry 488 (class 1259 OID 183842)
-- Name: custom_properties_view; Type: FOREIGN TABLE; Schema: bidb_ext; Owner: -
--

CREATE FOREIGN TABLE bidb_ext.custom_properties_view (
    "EntityId" character varying(255) NOT NULL,
    "PropertyId" character varying(255) NOT NULL,
    "Value" text,
    "PropertyName" character varying(255),
    "FqdnDisplay" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'bidb',
    table_name 'custom_properties_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext.custom_properties_view ALTER COLUMN "EntityId" OPTIONS (
    column_name 'EntityId'
);
ALTER FOREIGN TABLE ONLY bidb_ext.custom_properties_view ALTER COLUMN "PropertyId" OPTIONS (
    column_name 'PropertyId'
);
ALTER FOREIGN TABLE ONLY bidb_ext.custom_properties_view ALTER COLUMN "Value" OPTIONS (
    column_name 'Value'
);
ALTER FOREIGN TABLE ONLY bidb_ext.custom_properties_view ALTER COLUMN "PropertyName" OPTIONS (
    column_name 'PropertyName'
);
ALTER FOREIGN TABLE ONLY bidb_ext.custom_properties_view ALTER COLUMN "FqdnDisplay" OPTIONS (
    column_name 'FqdnDisplay'
);


--
-- TOC entry 489 (class 1259 OID 183845)
-- Name: datasource_category_mapping; Type: FOREIGN TABLE; Schema: bidb_ext; Owner: -
--

CREATE FOREIGN TABLE bidb_ext.datasource_category_mapping (
    "DataSourceType" text NOT NULL,
    category text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'bidb',
    table_name 'datasource_category_mapping'
);
ALTER FOREIGN TABLE ONLY bidb_ext.datasource_category_mapping ALTER COLUMN "DataSourceType" OPTIONS (
    column_name 'DataSourceType'
);
ALTER FOREIGN TABLE ONLY bidb_ext.datasource_category_mapping ALTER COLUMN category OPTIONS (
    column_name 'category'
);


--
-- TOC entry 490 (class 1259 OID 183848)
-- Name: delete_memo; Type: FOREIGN TABLE; Schema: bidb_ext; Owner: -
--

CREATE FOREIGN TABLE bidb_ext.delete_memo (
    view_name text NOT NULL,
    id text NOT NULL,
    related_id text,
    job_id text NOT NULL
)
SERVER remote_bidb
OPTIONS (
    schema_name 'bidb',
    table_name 'delete_memo'
);
ALTER FOREIGN TABLE ONLY bidb_ext.delete_memo ALTER COLUMN view_name OPTIONS (
    column_name 'view_name'
);
ALTER FOREIGN TABLE ONLY bidb_ext.delete_memo ALTER COLUMN id OPTIONS (
    column_name 'id'
);
ALTER FOREIGN TABLE ONLY bidb_ext.delete_memo ALTER COLUMN related_id OPTIONS (
    column_name 'related_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext.delete_memo ALTER COLUMN job_id OPTIONS (
    column_name 'job_id'
);


--
-- TOC entry 496 (class 1259 OID 183866)
-- Name: entities_master_view; Type: FOREIGN TABLE; Schema: bidb_ext; Owner: -
--

CREATE FOREIGN TABLE bidb_ext.entities_master_view (
    _id text NOT NULL,
    "Name" text,
    "Type" text,
    "Parent" text,
    "ResourceType" text,
    "DataSourceId" text,
    "DataSourceName" text,
    "DataSourceType" text,
    "DataSourceCostPerTbCurrency" text,
    "DataSourceCostPerTbPrice" integer,
    "DataSourceAffinityId" text,
    "DataProfileStatus" text,
    "DataProfiled" text,
    "LastUpdate" timestamp without time zone,
    "ProductName" text,
    "ProductVersion" text,
    "DriverName" text,
    "Url" text,
    "ParentName" text,
    "TotalTables" integer,
    "TotalColumns" integer,
    "SchemaName" text,
    "DatabaseName" text,
    "LastUpdateStatistics" timestamp without time zone,
    "RowCount" bigint,
    "NullCount" bigint,
    "Cardinality" bigint,
    "Hll" bigint,
    "BlankCount" bigint,
    "Min" double precision,
    "Max" double precision,
    "AvgValue" double precision,
    "MinWidth" integer,
    "MaxWidth" integer,
    "AvgWidth" double precision,
    "ColumnsCount" integer,
    "CheckClause" text,
    "TableName" text,
    "DataType" text,
    "TypeName" text,
    "ColumnSize" integer,
    "BufferLength" integer,
    "DecimalDigits" integer,
    "NumPrecRadix" integer,
    "IsNullable" boolean,
    "OrdinalPosition" integer,
    "IsPrimaryKey" boolean,
    "IsForeignKey" boolean,
    "Path" text,
    "ParentPath" text,
    "PathType" text,
    "FileExtension" text,
    "Size" bigint,
    "Flags" integer,
    "Owner" text,
    "Group" text,
    "SymLinkTarget" text,
    "FileType" text,
    "CreatedAt" timestamp without time zone,
    "ModifiedAt" timestamp without time zone,
    "AccessedAt" timestamp without time zone,
    "ScannedAt" timestamp without time zone,
    "IsSymlink" boolean,
    "LinkType" text,
    "PhysicalLocation" text,
    "Title" text,
    "Author" text,
    "Subject" text,
    "Application" text,
    "Producer" text,
    "Version" text,
    "DocumentSize" bigint,
    "PageSize" bigint,
    "PageCount" bigint,
    "Company" text,
    "Paragraphs" text,
    "Lines" bigint,
    "Words" bigint,
    "Characters" bigint,
    "CharactersWithSpaces" bigint,
    "Language" text,
    "Checksum" text,
    "PropertiesChecksum" text,
    "ChildDirs" bigint,
    "ChildFiles" bigint,
    "ChildDirSize" bigint,
    "ChildFileSize" bigint,
    "TotalChildDirs" bigint,
    "TotalChildFiles" bigint,
    "TotalChildDirSize" bigint,
    "TotalChildFileSize" bigint,
    "LocationName" text,
    "LocationStreetAddress" text,
    "LocationStreetAddress2" text,
    "LocationLocalityCity" text,
    "LocationStateProvince" text,
    "LocationPostalCode" text,
    "LocationCountry" text,
    "CostPerTbFrequency" text,
    "TotalCapacity" jsonb,
    "FqdnDisplay" text,
    "OwnerFirstName" text,
    "OwnerLastName" text,
    "OwnerEmail" text,
    "OwnerUserName" text,
    "OwnerIsDeleted" boolean,
    "UserAccessDetails" jsonb,
    "Sensitivity" text,
    "Selectivity" double precision,
    "Uniqueness" double precision,
    "Density" double precision,
    "LexicalMin" text,
    "LexicalMax" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'bidb',
    table_name 'entities_master_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Name" OPTIONS (
    column_name 'Name'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Type" OPTIONS (
    column_name 'Type'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Parent" OPTIONS (
    column_name 'Parent'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "ResourceType" OPTIONS (
    column_name 'ResourceType'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "DataSourceId" OPTIONS (
    column_name 'DataSourceId'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "DataSourceName" OPTIONS (
    column_name 'DataSourceName'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "DataSourceType" OPTIONS (
    column_name 'DataSourceType'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "DataSourceCostPerTbCurrency" OPTIONS (
    column_name 'DataSourceCostPerTbCurrency'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "DataSourceCostPerTbPrice" OPTIONS (
    column_name 'DataSourceCostPerTbPrice'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "DataSourceAffinityId" OPTIONS (
    column_name 'DataSourceAffinityId'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "DataProfileStatus" OPTIONS (
    column_name 'DataProfileStatus'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "DataProfiled" OPTIONS (
    column_name 'DataProfiled'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "LastUpdate" OPTIONS (
    column_name 'LastUpdate'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "ProductName" OPTIONS (
    column_name 'ProductName'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "ProductVersion" OPTIONS (
    column_name 'ProductVersion'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "DriverName" OPTIONS (
    column_name 'DriverName'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Url" OPTIONS (
    column_name 'Url'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "ParentName" OPTIONS (
    column_name 'ParentName'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "TotalTables" OPTIONS (
    column_name 'TotalTables'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "TotalColumns" OPTIONS (
    column_name 'TotalColumns'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "SchemaName" OPTIONS (
    column_name 'SchemaName'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "DatabaseName" OPTIONS (
    column_name 'DatabaseName'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "LastUpdateStatistics" OPTIONS (
    column_name 'LastUpdateStatistics'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "RowCount" OPTIONS (
    column_name 'RowCount'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "NullCount" OPTIONS (
    column_name 'NullCount'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Cardinality" OPTIONS (
    column_name 'Cardinality'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Hll" OPTIONS (
    column_name 'Hll'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "BlankCount" OPTIONS (
    column_name 'BlankCount'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Min" OPTIONS (
    column_name 'Min'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Max" OPTIONS (
    column_name 'Max'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "AvgValue" OPTIONS (
    column_name 'AvgValue'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "MinWidth" OPTIONS (
    column_name 'MinWidth'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "MaxWidth" OPTIONS (
    column_name 'MaxWidth'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "AvgWidth" OPTIONS (
    column_name 'AvgWidth'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "ColumnsCount" OPTIONS (
    column_name 'ColumnsCount'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "CheckClause" OPTIONS (
    column_name 'CheckClause'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "TableName" OPTIONS (
    column_name 'TableName'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "DataType" OPTIONS (
    column_name 'DataType'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "TypeName" OPTIONS (
    column_name 'TypeName'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "ColumnSize" OPTIONS (
    column_name 'ColumnSize'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "BufferLength" OPTIONS (
    column_name 'BufferLength'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "DecimalDigits" OPTIONS (
    column_name 'DecimalDigits'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "NumPrecRadix" OPTIONS (
    column_name 'NumPrecRadix'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "IsNullable" OPTIONS (
    column_name 'IsNullable'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "OrdinalPosition" OPTIONS (
    column_name 'OrdinalPosition'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "IsPrimaryKey" OPTIONS (
    column_name 'IsPrimaryKey'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "IsForeignKey" OPTIONS (
    column_name 'IsForeignKey'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Path" OPTIONS (
    column_name 'Path'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "ParentPath" OPTIONS (
    column_name 'ParentPath'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "PathType" OPTIONS (
    column_name 'PathType'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "FileExtension" OPTIONS (
    column_name 'FileExtension'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Size" OPTIONS (
    column_name 'Size'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Flags" OPTIONS (
    column_name 'Flags'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Owner" OPTIONS (
    column_name 'Owner'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Group" OPTIONS (
    column_name 'Group'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "SymLinkTarget" OPTIONS (
    column_name 'SymLinkTarget'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "FileType" OPTIONS (
    column_name 'FileType'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "CreatedAt" OPTIONS (
    column_name 'CreatedAt'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "ModifiedAt" OPTIONS (
    column_name 'ModifiedAt'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "AccessedAt" OPTIONS (
    column_name 'AccessedAt'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "ScannedAt" OPTIONS (
    column_name 'ScannedAt'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "IsSymlink" OPTIONS (
    column_name 'IsSymlink'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "LinkType" OPTIONS (
    column_name 'LinkType'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "PhysicalLocation" OPTIONS (
    column_name 'PhysicalLocation'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Title" OPTIONS (
    column_name 'Title'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Author" OPTIONS (
    column_name 'Author'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Subject" OPTIONS (
    column_name 'Subject'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Application" OPTIONS (
    column_name 'Application'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Producer" OPTIONS (
    column_name 'Producer'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Version" OPTIONS (
    column_name 'Version'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "DocumentSize" OPTIONS (
    column_name 'DocumentSize'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "PageSize" OPTIONS (
    column_name 'PageSize'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "PageCount" OPTIONS (
    column_name 'PageCount'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Company" OPTIONS (
    column_name 'Company'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Paragraphs" OPTIONS (
    column_name 'Paragraphs'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Lines" OPTIONS (
    column_name 'Lines'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Words" OPTIONS (
    column_name 'Words'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Characters" OPTIONS (
    column_name 'Characters'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "CharactersWithSpaces" OPTIONS (
    column_name 'CharactersWithSpaces'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Language" OPTIONS (
    column_name 'Language'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Checksum" OPTIONS (
    column_name 'Checksum'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "PropertiesChecksum" OPTIONS (
    column_name 'PropertiesChecksum'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "ChildDirs" OPTIONS (
    column_name 'ChildDirs'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "ChildFiles" OPTIONS (
    column_name 'ChildFiles'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "ChildDirSize" OPTIONS (
    column_name 'ChildDirSize'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "ChildFileSize" OPTIONS (
    column_name 'ChildFileSize'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "TotalChildDirs" OPTIONS (
    column_name 'TotalChildDirs'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "TotalChildFiles" OPTIONS (
    column_name 'TotalChildFiles'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "TotalChildDirSize" OPTIONS (
    column_name 'TotalChildDirSize'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "TotalChildFileSize" OPTIONS (
    column_name 'TotalChildFileSize'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "LocationName" OPTIONS (
    column_name 'LocationName'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "LocationStreetAddress" OPTIONS (
    column_name 'LocationStreetAddress'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "LocationStreetAddress2" OPTIONS (
    column_name 'LocationStreetAddress2'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "LocationLocalityCity" OPTIONS (
    column_name 'LocationLocalityCity'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "LocationStateProvince" OPTIONS (
    column_name 'LocationStateProvince'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "LocationPostalCode" OPTIONS (
    column_name 'LocationPostalCode'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "LocationCountry" OPTIONS (
    column_name 'LocationCountry'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "CostPerTbFrequency" OPTIONS (
    column_name 'CostPerTbFrequency'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "TotalCapacity" OPTIONS (
    column_name 'TotalCapacity'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "FqdnDisplay" OPTIONS (
    column_name 'FqdnDisplay'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "OwnerFirstName" OPTIONS (
    column_name 'OwnerFirstName'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "OwnerLastName" OPTIONS (
    column_name 'OwnerLastName'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "OwnerEmail" OPTIONS (
    column_name 'OwnerEmail'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "OwnerUserName" OPTIONS (
    column_name 'OwnerUserName'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "OwnerIsDeleted" OPTIONS (
    column_name 'OwnerIsDeleted'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "UserAccessDetails" OPTIONS (
    column_name 'UserAccessDetails'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Sensitivity" OPTIONS (
    column_name 'Sensitivity'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Selectivity" OPTIONS (
    column_name 'Selectivity'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Uniqueness" OPTIONS (
    column_name 'Uniqueness'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "Density" OPTIONS (
    column_name 'Density'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "LexicalMin" OPTIONS (
    column_name 'LexicalMin'
);
ALTER FOREIGN TABLE ONLY bidb_ext.entities_master_view ALTER COLUMN "LexicalMax" OPTIONS (
    column_name 'LexicalMax'
);


--
-- TOC entry 512 (class 1259 OID 183914)
-- Name: terms_view; Type: FOREIGN TABLE; Schema: bidb_ext; Owner: -
--

CREATE FOREIGN TABLE bidb_ext.terms_view (
    "EntityId" text NOT NULL,
    "TermName" text,
    "GlossaryId" text,
    "TermId" text NOT NULL,
    "FqdnDisplay" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'bidb',
    table_name 'terms_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext.terms_view ALTER COLUMN "EntityId" OPTIONS (
    column_name 'EntityId'
);
ALTER FOREIGN TABLE ONLY bidb_ext.terms_view ALTER COLUMN "TermName" OPTIONS (
    column_name 'TermName'
);
ALTER FOREIGN TABLE ONLY bidb_ext.terms_view ALTER COLUMN "GlossaryId" OPTIONS (
    column_name 'GlossaryId'
);
ALTER FOREIGN TABLE ONLY bidb_ext.terms_view ALTER COLUMN "TermId" OPTIONS (
    column_name 'TermId'
);
ALTER FOREIGN TABLE ONLY bidb_ext.terms_view ALTER COLUMN "FqdnDisplay" OPTIONS (
    column_name 'FqdnDisplay'
);


