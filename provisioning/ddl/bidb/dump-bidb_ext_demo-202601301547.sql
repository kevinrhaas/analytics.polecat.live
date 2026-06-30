--
-- PostgreSQL database dump
--

\restrict Px6G00OZPyyWyvHPZQOcjPTBFogmzXdrwKthp9GQDTvvxSq3f8omb2toMqUJKwN

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7 (Homebrew)

-- Started on 2026-01-30 15:47:55 CST

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
-- Name: bidb_ext_demo; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA bidb_ext_demo;


--
-- TOC entry 2 (class 3079 OID 16442)
-- Name: postgres_fdw; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgres_fdw WITH SCHEMA bidb_ext_demo;


--
-- TOC entry 5289 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION postgres_fdw; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgres_fdw IS 'foreign-data wrapper for remote PostgreSQL servers';


--
-- TOC entry 482 (class 1259 OID 179149)
-- Name: SequelizeMeta; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo."SequelizeMeta" (
    name character varying(255) NOT NULL
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'SequelizeMeta'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo."SequelizeMeta" ALTER COLUMN name OPTIONS (
    column_name 'name'
);


--
-- TOC entry 483 (class 1259 OID 179152)
-- Name: applications_policies_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.applications_policies_view (
    _id bigint NOT NULL,
    "ApplicationId" text,
    "PolicyId" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'applications_policies_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.applications_policies_view ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.applications_policies_view ALTER COLUMN "ApplicationId" OPTIONS (
    column_name 'ApplicationId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.applications_policies_view ALTER COLUMN "PolicyId" OPTIONS (
    column_name 'PolicyId'
);


--
-- TOC entry 484 (class 1259 OID 179155)
-- Name: applications_summary_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.applications_summary_view (
    _id text NOT NULL,
    "Name" text,
    "Type" text,
    "Parent" text,
    "Fqdn" text,
    "UsersWithAccess" jsonb
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'applications_summary_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.applications_summary_view ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.applications_summary_view ALTER COLUMN "Name" OPTIONS (
    column_name 'Name'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.applications_summary_view ALTER COLUMN "Type" OPTIONS (
    column_name 'Type'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.applications_summary_view ALTER COLUMN "Parent" OPTIONS (
    column_name 'Parent'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.applications_summary_view ALTER COLUMN "Fqdn" OPTIONS (
    column_name 'Fqdn'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.applications_summary_view ALTER COLUMN "UsersWithAccess" OPTIONS (
    column_name 'UsersWithAccess'
);


--
-- TOC entry 485 (class 1259 OID 179158)
-- Name: applications_terms_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.applications_terms_view (
    _id bigint NOT NULL,
    "ApplicationId" text,
    "TermId" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'applications_terms_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.applications_terms_view ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.applications_terms_view ALTER COLUMN "ApplicationId" OPTIONS (
    column_name 'ApplicationId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.applications_terms_view ALTER COLUMN "TermId" OPTIONS (
    column_name 'TermId'
);


--
-- TOC entry 486 (class 1259 OID 179161)
-- Name: checksum_aggregated_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.checksum_aggregated_view (
    _id text NOT NULL,
    "duplicateFilesCount" integer,
    "duplicateFilesSize" bigint
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'checksum_aggregated_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.checksum_aggregated_view ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.checksum_aggregated_view ALTER COLUMN "duplicateFilesCount" OPTIONS (
    column_name 'duplicateFilesCount'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.checksum_aggregated_view ALTER COLUMN "duplicateFilesSize" OPTIONS (
    column_name 'duplicateFilesSize'
);


--
-- TOC entry 487 (class 1259 OID 179164)
-- Name: currency_exchange_rates; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.currency_exchange_rates (
    currency_symbol text NOT NULL,
    "ConversionRateToUSD" double precision
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'currency_exchange_rates'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.currency_exchange_rates ALTER COLUMN currency_symbol OPTIONS (
    column_name 'currency_symbol'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.currency_exchange_rates ALTER COLUMN "ConversionRateToUSD" OPTIONS (
    column_name 'ConversionRateToUSD'
);


--
-- TOC entry 488 (class 1259 OID 179167)
-- Name: custom_properties_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.custom_properties_view (
    "EntityId" character varying(255) NOT NULL,
    "PropertyId" character varying(255) NOT NULL,
    "Value" text,
    "PropertyName" character varying(255),
    "FqdnDisplay" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'custom_properties_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.custom_properties_view ALTER COLUMN "EntityId" OPTIONS (
    column_name 'EntityId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.custom_properties_view ALTER COLUMN "PropertyId" OPTIONS (
    column_name 'PropertyId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.custom_properties_view ALTER COLUMN "Value" OPTIONS (
    column_name 'Value'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.custom_properties_view ALTER COLUMN "PropertyName" OPTIONS (
    column_name 'PropertyName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.custom_properties_view ALTER COLUMN "FqdnDisplay" OPTIONS (
    column_name 'FqdnDisplay'
);


--
-- TOC entry 489 (class 1259 OID 179170)
-- Name: datasource_category_mapping; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.datasource_category_mapping (
    "DataSourceType" text NOT NULL,
    category text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'datasource_category_mapping'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.datasource_category_mapping ALTER COLUMN "DataSourceType" OPTIONS (
    column_name 'DataSourceType'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.datasource_category_mapping ALTER COLUMN category OPTIONS (
    column_name 'category'
);


--
-- TOC entry 490 (class 1259 OID 179173)
-- Name: delete_memo; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.delete_memo (
    view_name text NOT NULL,
    id text NOT NULL,
    related_id text,
    job_id text NOT NULL
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'delete_memo'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.delete_memo ALTER COLUMN view_name OPTIONS (
    column_name 'view_name'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.delete_memo ALTER COLUMN id OPTIONS (
    column_name 'id'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.delete_memo ALTER COLUMN related_id OPTIONS (
    column_name 'related_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.delete_memo ALTER COLUMN job_id OPTIONS (
    column_name 'job_id'
);


--
-- TOC entry 496 (class 1259 OID 179191)
-- Name: entities_master_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.entities_master_view (
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
    "Sensitivity" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'entities_master_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Name" OPTIONS (
    column_name 'Name'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Type" OPTIONS (
    column_name 'Type'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Parent" OPTIONS (
    column_name 'Parent'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "ResourceType" OPTIONS (
    column_name 'ResourceType'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "DataSourceId" OPTIONS (
    column_name 'DataSourceId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "DataSourceName" OPTIONS (
    column_name 'DataSourceName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "DataSourceType" OPTIONS (
    column_name 'DataSourceType'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "DataSourceCostPerTbCurrency" OPTIONS (
    column_name 'DataSourceCostPerTbCurrency'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "DataSourceCostPerTbPrice" OPTIONS (
    column_name 'DataSourceCostPerTbPrice'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "DataSourceAffinityId" OPTIONS (
    column_name 'DataSourceAffinityId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "DataProfileStatus" OPTIONS (
    column_name 'DataProfileStatus'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "DataProfiled" OPTIONS (
    column_name 'DataProfiled'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "LastUpdate" OPTIONS (
    column_name 'LastUpdate'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "ProductName" OPTIONS (
    column_name 'ProductName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "ProductVersion" OPTIONS (
    column_name 'ProductVersion'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "DriverName" OPTIONS (
    column_name 'DriverName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Url" OPTIONS (
    column_name 'Url'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "ParentName" OPTIONS (
    column_name 'ParentName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "TotalTables" OPTIONS (
    column_name 'TotalTables'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "TotalColumns" OPTIONS (
    column_name 'TotalColumns'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "SchemaName" OPTIONS (
    column_name 'SchemaName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "DatabaseName" OPTIONS (
    column_name 'DatabaseName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "LastUpdateStatistics" OPTIONS (
    column_name 'LastUpdateStatistics'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "RowCount" OPTIONS (
    column_name 'RowCount'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "NullCount" OPTIONS (
    column_name 'NullCount'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Cardinality" OPTIONS (
    column_name 'Cardinality'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Hll" OPTIONS (
    column_name 'Hll'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "BlankCount" OPTIONS (
    column_name 'BlankCount'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Min" OPTIONS (
    column_name 'Min'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Max" OPTIONS (
    column_name 'Max'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "AvgValue" OPTIONS (
    column_name 'AvgValue'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "MinWidth" OPTIONS (
    column_name 'MinWidth'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "MaxWidth" OPTIONS (
    column_name 'MaxWidth'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "AvgWidth" OPTIONS (
    column_name 'AvgWidth'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "ColumnsCount" OPTIONS (
    column_name 'ColumnsCount'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "CheckClause" OPTIONS (
    column_name 'CheckClause'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "TableName" OPTIONS (
    column_name 'TableName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "DataType" OPTIONS (
    column_name 'DataType'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "TypeName" OPTIONS (
    column_name 'TypeName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "ColumnSize" OPTIONS (
    column_name 'ColumnSize'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "BufferLength" OPTIONS (
    column_name 'BufferLength'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "DecimalDigits" OPTIONS (
    column_name 'DecimalDigits'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "NumPrecRadix" OPTIONS (
    column_name 'NumPrecRadix'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "IsNullable" OPTIONS (
    column_name 'IsNullable'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "OrdinalPosition" OPTIONS (
    column_name 'OrdinalPosition'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "IsPrimaryKey" OPTIONS (
    column_name 'IsPrimaryKey'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "IsForeignKey" OPTIONS (
    column_name 'IsForeignKey'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Path" OPTIONS (
    column_name 'Path'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "ParentPath" OPTIONS (
    column_name 'ParentPath'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "PathType" OPTIONS (
    column_name 'PathType'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "FileExtension" OPTIONS (
    column_name 'FileExtension'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Size" OPTIONS (
    column_name 'Size'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Flags" OPTIONS (
    column_name 'Flags'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Owner" OPTIONS (
    column_name 'Owner'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Group" OPTIONS (
    column_name 'Group'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "SymLinkTarget" OPTIONS (
    column_name 'SymLinkTarget'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "FileType" OPTIONS (
    column_name 'FileType'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "CreatedAt" OPTIONS (
    column_name 'CreatedAt'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "ModifiedAt" OPTIONS (
    column_name 'ModifiedAt'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "AccessedAt" OPTIONS (
    column_name 'AccessedAt'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "ScannedAt" OPTIONS (
    column_name 'ScannedAt'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "IsSymlink" OPTIONS (
    column_name 'IsSymlink'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "LinkType" OPTIONS (
    column_name 'LinkType'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "PhysicalLocation" OPTIONS (
    column_name 'PhysicalLocation'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Title" OPTIONS (
    column_name 'Title'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Author" OPTIONS (
    column_name 'Author'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Subject" OPTIONS (
    column_name 'Subject'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Application" OPTIONS (
    column_name 'Application'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Producer" OPTIONS (
    column_name 'Producer'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Version" OPTIONS (
    column_name 'Version'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "DocumentSize" OPTIONS (
    column_name 'DocumentSize'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "PageSize" OPTIONS (
    column_name 'PageSize'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "PageCount" OPTIONS (
    column_name 'PageCount'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Company" OPTIONS (
    column_name 'Company'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Paragraphs" OPTIONS (
    column_name 'Paragraphs'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Lines" OPTIONS (
    column_name 'Lines'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Words" OPTIONS (
    column_name 'Words'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Characters" OPTIONS (
    column_name 'Characters'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "CharactersWithSpaces" OPTIONS (
    column_name 'CharactersWithSpaces'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Language" OPTIONS (
    column_name 'Language'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Checksum" OPTIONS (
    column_name 'Checksum'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "PropertiesChecksum" OPTIONS (
    column_name 'PropertiesChecksum'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "ChildDirs" OPTIONS (
    column_name 'ChildDirs'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "ChildFiles" OPTIONS (
    column_name 'ChildFiles'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "ChildDirSize" OPTIONS (
    column_name 'ChildDirSize'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "ChildFileSize" OPTIONS (
    column_name 'ChildFileSize'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "TotalChildDirs" OPTIONS (
    column_name 'TotalChildDirs'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "TotalChildFiles" OPTIONS (
    column_name 'TotalChildFiles'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "TotalChildDirSize" OPTIONS (
    column_name 'TotalChildDirSize'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "TotalChildFileSize" OPTIONS (
    column_name 'TotalChildFileSize'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "LocationName" OPTIONS (
    column_name 'LocationName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "LocationStreetAddress" OPTIONS (
    column_name 'LocationStreetAddress'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "LocationStreetAddress2" OPTIONS (
    column_name 'LocationStreetAddress2'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "LocationLocalityCity" OPTIONS (
    column_name 'LocationLocalityCity'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "LocationStateProvince" OPTIONS (
    column_name 'LocationStateProvince'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "LocationPostalCode" OPTIONS (
    column_name 'LocationPostalCode'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "LocationCountry" OPTIONS (
    column_name 'LocationCountry'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "CostPerTbFrequency" OPTIONS (
    column_name 'CostPerTbFrequency'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "TotalCapacity" OPTIONS (
    column_name 'TotalCapacity'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "FqdnDisplay" OPTIONS (
    column_name 'FqdnDisplay'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "OwnerFirstName" OPTIONS (
    column_name 'OwnerFirstName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "OwnerLastName" OPTIONS (
    column_name 'OwnerLastName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "OwnerEmail" OPTIONS (
    column_name 'OwnerEmail'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "OwnerUserName" OPTIONS (
    column_name 'OwnerUserName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "OwnerIsDeleted" OPTIONS (
    column_name 'OwnerIsDeleted'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "UserAccessDetails" OPTIONS (
    column_name 'UserAccessDetails'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_master_view ALTER COLUMN "Sensitivity" OPTIONS (
    column_name 'Sensitivity'
);


--
-- TOC entry 512 (class 1259 OID 179239)
-- Name: terms_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.terms_view (
    "EntityId" text NOT NULL,
    "TermName" text,
    "GlossaryId" text,
    "TermId" text NOT NULL,
    "FqdnDisplay" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'terms_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.terms_view ALTER COLUMN "EntityId" OPTIONS (
    column_name 'EntityId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.terms_view ALTER COLUMN "TermName" OPTIONS (
    column_name 'TermName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.terms_view ALTER COLUMN "GlossaryId" OPTIONS (
    column_name 'GlossaryId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.terms_view ALTER COLUMN "TermId" OPTIONS (
    column_name 'TermId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.terms_view ALTER COLUMN "FqdnDisplay" OPTIONS (
    column_name 'FqdnDisplay'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 513 (class 1259 OID 179242)
-- Name: mv_stg_entity_term; Type: MATERIALIZED VIEW; Schema: bidb_ext_demo; Owner: -
--

CREATE MATERIALIZED VIEW bidb_ext_demo.mv_stg_entity_term AS
 SELECT emv._id AS entity_nk,
    emv."FqdnDisplay" AS entity_fqdn,
    tv."TermName" AS term_name,
    emv."DataSourceId" AS datasource_nk,
    emv."DataSourceName" AS datasource_name,
    emv."DataSourceType" AS datasource_type,
    emv."Name" AS entity_name,
    emv."Type" AS entity_type,
    emv."ResourceType" AS resource_type,
    emv."Path" AS path,
    emv."ParentPath" AS parent_path,
    emv."PathType" AS path_type,
    emv."FileExtension" AS file_extension,
    emv."Url" AS url,
    emv."PhysicalLocation" AS physicallocation,
    emv."Owner" AS owner_name,
    emv."Group" AS group_name,
        CASE
            WHEN (emv."FileType" ~~* 'parquet%'::text) THEN 'parquet'::text
            ELSE emv."FileType"
        END AS filetype,
    to_timestamp((emv."CreatedAt")::text, 'YYYY-MM-DD HH24:MI:SS'::text) AS created_ts,
    to_timestamp((emv."ModifiedAt")::text, 'YYYY-MM-DD HH24:MI:SS'::text) AS modified_ts,
    to_timestamp((emv."AccessedAt")::text, 'YYYY-MM-DD HH24:MI:SS'::text) AS accessed_ts,
    to_timestamp((emv."ScannedAt")::text, 'YYYY-MM-DD HH24:MI:SS'::text) AS scanned_ts,
    to_timestamp((emv."LastUpdate")::text, 'YYYY-MM-DD HH24:MI:SS'::text) AS last_update_ts,
    to_timestamp((emv."LastUpdateStatistics")::text, 'YYYY-MM-DD HH24:MI:SS'::text) AS last_update_statistics_ts,
    COALESCE(emv."Size", (0)::bigint) AS bytes
   FROM (bidb_ext_demo.entities_master_view emv
     LEFT JOIN bidb_ext_demo.terms_view tv ON ((emv."FqdnDisplay" = tv."FqdnDisplay")))
  WITH NO DATA;


--
-- TOC entry 516 (class 1259 OID 179277)
-- Name: dim_datasource; Type: MATERIALIZED VIEW; Schema: bidb_ext_demo; Owner: -
--

CREATE MATERIALIZED VIEW bidb_ext_demo.dim_datasource AS
 SELECT md5(datasource_nk) AS datasource_key,
    datasource_nk,
    datasource_name,
    datasource_type
   FROM bidb_ext_demo.mv_stg_entity_term
  WHERE (datasource_nk IS NOT NULL)
  GROUP BY (md5(datasource_nk)), datasource_nk, datasource_name, datasource_type
  WITH NO DATA;


--
-- TOC entry 518 (class 1259 OID 179299)
-- Name: dim_date; Type: MATERIALIZED VIEW; Schema: bidb_ext_demo; Owner: -
--

CREATE MATERIALIZED VIEW bidb_ext_demo.dim_date AS
 WITH date_range AS (
         SELECT LEAST(min((mv_stg_entity_term.created_ts)::date), min((mv_stg_entity_term.modified_ts)::date), min((mv_stg_entity_term.accessed_ts)::date), min((mv_stg_entity_term.scanned_ts)::date), min((mv_stg_entity_term.last_update_ts)::date), min((mv_stg_entity_term.last_update_statistics_ts)::date)) AS min_date,
            GREATEST(max((mv_stg_entity_term.created_ts)::date), max((mv_stg_entity_term.modified_ts)::date), max((mv_stg_entity_term.accessed_ts)::date), max((mv_stg_entity_term.scanned_ts)::date), max((mv_stg_entity_term.last_update_ts)::date), max((mv_stg_entity_term.last_update_statistics_ts)::date), CURRENT_DATE) AS max_date
           FROM bidb_ext_demo.mv_stg_entity_term
        ), all_dates AS (
         SELECT (generate_series((( SELECT date_range.min_date
                   FROM date_range))::timestamp with time zone, (( SELECT date_range.max_date
                   FROM date_range))::timestamp with time zone, '1 day'::interval))::date AS d
        UNION
         SELECT '1900-01-01'::date AS date
        )
 SELECT (to_char((d)::timestamp with time zone, 'YYYYMMDD'::text))::integer AS date_key,
    d AS full_date,
    (EXTRACT(year FROM d))::integer AS year,
    (EXTRACT(month FROM d))::integer AS month,
    (EXTRACT(day FROM d))::integer AS day,
    (EXTRACT(dow FROM d))::integer AS day_of_week,
        CASE
            WHEN (d = '1900-01-01'::date) THEN true
            ELSE false
        END AS is_unknown
   FROM all_dates
  WITH NO DATA;


--
-- TOC entry 515 (class 1259 OID 179265)
-- Name: dim_entity; Type: MATERIALIZED VIEW; Schema: bidb_ext_demo; Owner: -
--

CREATE MATERIALIZED VIEW bidb_ext_demo.dim_entity AS
 SELECT md5(entity_nk) AS entity_key,
    entity_nk,
    entity_fqdn,
    entity_name,
    entity_type,
    resource_type,
    path,
    parent_path,
    owner_name,
    group_name,
    filetype,
    file_extension,
    path_type,
    url,
    physicallocation,
    datasource_nk
   FROM ( SELECT DISTINCT ON (mv_stg_entity_term.entity_nk) mv_stg_entity_term.entity_nk,
            mv_stg_entity_term.entity_fqdn,
            mv_stg_entity_term.entity_name,
            mv_stg_entity_term.entity_type,
            mv_stg_entity_term.resource_type,
            mv_stg_entity_term.path,
            mv_stg_entity_term.parent_path,
            mv_stg_entity_term.owner_name,
            mv_stg_entity_term.group_name,
            mv_stg_entity_term.filetype,
            mv_stg_entity_term.file_extension,
            mv_stg_entity_term.path_type,
            mv_stg_entity_term.url,
            mv_stg_entity_term.physicallocation,
            mv_stg_entity_term.datasource_nk
           FROM bidb_ext_demo.mv_stg_entity_term
          WHERE (mv_stg_entity_term.entity_nk IS NOT NULL)
          ORDER BY mv_stg_entity_term.entity_nk) x
  WITH NO DATA;


--
-- TOC entry 517 (class 1259 OID 179288)
-- Name: dim_filetype; Type: MATERIALIZED VIEW; Schema: bidb_ext_demo; Owner: -
--

CREATE MATERIALIZED VIEW bidb_ext_demo.dim_filetype AS
 SELECT md5(lower(TRIM(BOTH FROM filetype))) AS filetype_key,
    filetype
   FROM bidb_ext_demo.mv_stg_entity_term
  WHERE (filetype IS NOT NULL)
  GROUP BY (md5(lower(TRIM(BOTH FROM filetype)))), filetype
  WITH NO DATA;


--
-- TOC entry 514 (class 1259 OID 179254)
-- Name: dim_term; Type: MATERIALIZED VIEW; Schema: bidb_ext_demo; Owner: -
--

CREATE MATERIALIZED VIEW bidb_ext_demo.dim_term AS
 SELECT md5(lower(TRIM(BOTH FROM term_name))) AS term_key,
    term_name
   FROM bidb_ext_demo.mv_stg_entity_term
  WHERE (term_name IS NOT NULL)
  GROUP BY (md5(lower(TRIM(BOTH FROM term_name)))), term_name
  WITH NO DATA;


--
-- TOC entry 491 (class 1259 OID 179176)
-- Name: duplicate_files_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.duplicate_files_view (
    _id bigint NOT NULL,
    "EntityId" text,
    "GroupId" text,
    "FileCount" integer,
    "Size" bigint,
    "CreatedAt" timestamp without time zone,
    "ModifiedAt" timestamp without time zone
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'duplicate_files_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.duplicate_files_view ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.duplicate_files_view ALTER COLUMN "EntityId" OPTIONS (
    column_name 'EntityId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.duplicate_files_view ALTER COLUMN "GroupId" OPTIONS (
    column_name 'GroupId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.duplicate_files_view ALTER COLUMN "FileCount" OPTIONS (
    column_name 'FileCount'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.duplicate_files_view ALTER COLUMN "Size" OPTIONS (
    column_name 'Size'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.duplicate_files_view ALTER COLUMN "CreatedAt" OPTIONS (
    column_name 'CreatedAt'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.duplicate_files_view ALTER COLUMN "ModifiedAt" OPTIONS (
    column_name 'ModifiedAt'
);


--
-- TOC entry 492 (class 1259 OID 179179)
-- Name: entities_aggregated_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.entities_aggregated_view (
    "Attribute" character varying,
    "Type" character varying,
    "Value" jsonb
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'entities_aggregated_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_aggregated_view ALTER COLUMN "Attribute" OPTIONS (
    column_name 'Attribute'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_aggregated_view ALTER COLUMN "Type" OPTIONS (
    column_name 'Type'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_aggregated_view ALTER COLUMN "Value" OPTIONS (
    column_name 'Value'
);


--
-- TOC entry 493 (class 1259 OID 179182)
-- Name: entities_applications_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.entities_applications_view (
    "EntityId" text,
    "ApplicationId" text,
    "FqdnDisplay" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'entities_applications_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_applications_view ALTER COLUMN "EntityId" OPTIONS (
    column_name 'EntityId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_applications_view ALTER COLUMN "ApplicationId" OPTIONS (
    column_name 'ApplicationId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_applications_view ALTER COLUMN "FqdnDisplay" OPTIONS (
    column_name 'FqdnDisplay'
);


--
-- TOC entry 494 (class 1259 OID 179185)
-- Name: entities_custom_categorization; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.entities_custom_categorization (
    _id character varying(24) NOT NULL,
    "EntityCategory" text,
    "GlossaryName" text,
    "GlossaryType" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'entities_custom_categorization'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_custom_categorization ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_custom_categorization ALTER COLUMN "EntityCategory" OPTIONS (
    column_name 'EntityCategory'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_custom_categorization ALTER COLUMN "GlossaryName" OPTIONS (
    column_name 'GlossaryName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_custom_categorization ALTER COLUMN "GlossaryType" OPTIONS (
    column_name 'GlossaryType'
);


--
-- TOC entry 495 (class 1259 OID 179188)
-- Name: entities_extension_count_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.entities_extension_count_view (
    _id text NOT NULL,
    "Date" timestamp without time zone,
    "DataSourceFqdnId" text,
    "Extension" text,
    "FileCount" integer
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'entities_extension_count_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_extension_count_view ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_extension_count_view ALTER COLUMN "Date" OPTIONS (
    column_name 'Date'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_extension_count_view ALTER COLUMN "DataSourceFqdnId" OPTIONS (
    column_name 'DataSourceFqdnId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_extension_count_view ALTER COLUMN "Extension" OPTIONS (
    column_name 'Extension'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_extension_count_view ALTER COLUMN "FileCount" OPTIONS (
    column_name 'FileCount'
);


--
-- TOC entry 497 (class 1259 OID 179194)
-- Name: entities_policies_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.entities_policies_view (
    "EntityId" text,
    "PolicyId" text,
    "FqdnDisplay" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'entities_policies_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_policies_view ALTER COLUMN "EntityId" OPTIONS (
    column_name 'EntityId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_policies_view ALTER COLUMN "PolicyId" OPTIONS (
    column_name 'PolicyId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_policies_view ALTER COLUMN "FqdnDisplay" OPTIONS (
    column_name 'FqdnDisplay'
);


--
-- TOC entry 498 (class 1259 OID 179197)
-- Name: entities_summary_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.entities_summary_view (
    _id text,
    "Name" text,
    "Type" text,
    "Parent" text,
    "FqdnDisplay" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'entities_summary_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_summary_view ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_summary_view ALTER COLUMN "Name" OPTIONS (
    column_name 'Name'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_summary_view ALTER COLUMN "Type" OPTIONS (
    column_name 'Type'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_summary_view ALTER COLUMN "Parent" OPTIONS (
    column_name 'Parent'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_summary_view ALTER COLUMN "FqdnDisplay" OPTIONS (
    column_name 'FqdnDisplay'
);


--
-- TOC entry 499 (class 1259 OID 179200)
-- Name: entities_temperature_count_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.entities_temperature_count_view (
    _id text NOT NULL,
    "Date" timestamp without time zone,
    "DataSourceFqdnId" text,
    "Temperature" text,
    "FileCount" integer
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'entities_temperature_count_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_temperature_count_view ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_temperature_count_view ALTER COLUMN "Date" OPTIONS (
    column_name 'Date'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_temperature_count_view ALTER COLUMN "DataSourceFqdnId" OPTIONS (
    column_name 'DataSourceFqdnId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_temperature_count_view ALTER COLUMN "Temperature" OPTIONS (
    column_name 'Temperature'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.entities_temperature_count_view ALTER COLUMN "FileCount" OPTIONS (
    column_name 'FileCount'
);


--
-- TOC entry 520 (class 1259 OID 179319)
-- Name: fact_entity_snapshot; Type: MATERIALIZED VIEW; Schema: bidb_ext_demo; Owner: -
--

CREATE MATERIALIZED VIEW bidb_ext_demo.fact_entity_snapshot AS
 SELECT DISTINCT ON (stg.entity_nk, ((stg.scanned_ts)::date)) md5(stg.entity_nk) AS entity_key,
    md5(stg.datasource_nk) AS datasource_key,
    COALESCE((to_char(((stg.scanned_ts)::date)::timestamp with time zone, 'YYYYMMDD'::text))::integer, 19000101) AS scanned_date_key,
    COALESCE((to_char(((stg.created_ts)::date)::timestamp with time zone, 'YYYYMMDD'::text))::integer, 19000101) AS created_date_key,
    COALESCE((to_char(((stg.modified_ts)::date)::timestamp with time zone, 'YYYYMMDD'::text))::integer, 19000101) AS modified_date_key,
    COALESCE((to_char(((stg.accessed_ts)::date)::timestamp with time zone, 'YYYYMMDD'::text))::integer, 19000101) AS accessed_date_key,
    COALESCE((to_char(((stg.last_update_ts)::date)::timestamp with time zone, 'YYYYMMDD'::text))::integer, 19000101) AS last_update_date_key,
    COALESCE((to_char(((stg.last_update_statistics_ts)::date)::timestamp with time zone, 'YYYYMMDD'::text))::integer, 19000101) AS last_update_statistics_date_key,
    1 AS entity_count,
    COALESCE(stg.bytes, (0)::bigint) AS bytes,
    COALESCE(emv."ChildDirs", (0)::bigint) AS child_dirs,
    COALESCE(emv."ChildFiles", (0)::bigint) AS child_files,
    COALESCE(emv."ChildDirSize", (0)::bigint) AS child_dir_bytes,
    COALESCE(emv."ChildFileSize", (0)::bigint) AS child_file_bytes,
    COALESCE(emv."TotalChildDirs", (0)::bigint) AS total_child_dirs,
    COALESCE(emv."TotalChildFiles", (0)::bigint) AS total_child_files,
    COALESCE(emv."TotalChildDirSize", (0)::bigint) AS total_child_dir_bytes,
    COALESCE(emv."TotalChildFileSize", (0)::bigint) AS total_child_file_bytes,
    COALESCE((((date_part('year'::text, age(stg.scanned_ts, stg.created_ts)))::integer * 12) + (date_part('month'::text, age(stg.scanned_ts, stg.created_ts)))::integer), 0) AS created_age_months,
    COALESCE((date_part('year'::text, age(stg.scanned_ts, stg.created_ts)))::integer, 0) AS created_age_years,
    COALESCE((((date_part('year'::text, age(stg.scanned_ts, stg.modified_ts)))::integer * 12) + (date_part('month'::text, age(stg.scanned_ts, stg.modified_ts)))::integer), 0) AS modified_age_months,
    COALESCE((date_part('year'::text, age(stg.scanned_ts, stg.modified_ts)))::integer, 0) AS modified_age_years,
    COALESCE((((date_part('year'::text, age(stg.scanned_ts, stg.accessed_ts)))::integer * 12) + (date_part('month'::text, age(stg.scanned_ts, stg.accessed_ts)))::integer), 0) AS accessed_age_months,
    COALESCE((date_part('year'::text, age(stg.scanned_ts, stg.accessed_ts)))::integer, 0) AS accessed_age_years
   FROM (bidb_ext_demo.mv_stg_entity_term stg
     LEFT JOIN bidb_ext_demo.entities_master_view emv ON ((stg.entity_nk = emv._id)))
  WHERE ((stg.entity_nk IS NOT NULL) AND (stg.scanned_ts IS NOT NULL))
  WITH NO DATA;


--
-- TOC entry 519 (class 1259 OID 179307)
-- Name: fact_entity_term; Type: MATERIALIZED VIEW; Schema: bidb_ext_demo; Owner: -
--

CREATE MATERIALIZED VIEW bidb_ext_demo.fact_entity_term AS
 SELECT md5(entity_nk) AS entity_key,
    md5(lower(TRIM(BOTH FROM term_name))) AS term_key,
    md5(datasource_nk) AS datasource_key,
    COALESCE((to_char(((created_ts)::date)::timestamp with time zone, 'YYYYMMDD'::text))::integer, 19000101) AS created_date_key,
    COALESCE((to_char(((modified_ts)::date)::timestamp with time zone, 'YYYYMMDD'::text))::integer, 19000101) AS modified_date_key,
    COALESCE((to_char(((accessed_ts)::date)::timestamp with time zone, 'YYYYMMDD'::text))::integer, 19000101) AS accessed_date_key,
    COALESCE((to_char(((scanned_ts)::date)::timestamp with time zone, 'YYYYMMDD'::text))::integer, 19000101) AS scanned_date_key,
    1 AS association_count
   FROM bidb_ext_demo.mv_stg_entity_term stg
  WHERE ((entity_nk IS NOT NULL) AND (term_name IS NOT NULL))
  WITH NO DATA;


--
-- TOC entry 500 (class 1259 OID 179203)
-- Name: glossary_summary_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.glossary_summary_view (
    _id text NOT NULL,
    "Name" text,
    "Type" text,
    "Parent" text,
    "Fqdn" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'glossary_summary_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.glossary_summary_view ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.glossary_summary_view ALTER COLUMN "Name" OPTIONS (
    column_name 'Name'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.glossary_summary_view ALTER COLUMN "Type" OPTIONS (
    column_name 'Type'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.glossary_summary_view ALTER COLUMN "Parent" OPTIONS (
    column_name 'Parent'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.glossary_summary_view ALTER COLUMN "Fqdn" OPTIONS (
    column_name 'Fqdn'
);


--
-- TOC entry 501 (class 1259 OID 179206)
-- Name: mv_duplicate_by_term_summary_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.mv_duplicate_by_term_summary_view (
    term_label text,
    entity_count bigint,
    total_duplicate_tb double precision,
    total_duplicate_cost_usd double precision
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'mv_duplicate_by_term_summary_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_by_term_summary_view ALTER COLUMN term_label OPTIONS (
    column_name 'term_label'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_by_term_summary_view ALTER COLUMN entity_count OPTIONS (
    column_name 'entity_count'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_by_term_summary_view ALTER COLUMN total_duplicate_tb OPTIONS (
    column_name 'total_duplicate_tb'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_by_term_summary_view ALTER COLUMN total_duplicate_cost_usd OPTIONS (
    column_name 'total_duplicate_cost_usd'
);


--
-- TOC entry 502 (class 1259 OID 179209)
-- Name: mv_duplicate_entities_summary_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.mv_duplicate_entities_summary_view (
    total_duplicate_files bigint,
    total_duplicate_tb double precision,
    total_duplicate_cost_usd double precision
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'mv_duplicate_entities_summary_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_entities_summary_view ALTER COLUMN total_duplicate_files OPTIONS (
    column_name 'total_duplicate_files'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_entities_summary_view ALTER COLUMN total_duplicate_tb OPTIONS (
    column_name 'total_duplicate_tb'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_entities_summary_view ALTER COLUMN total_duplicate_cost_usd OPTIONS (
    column_name 'total_duplicate_cost_usd'
);


--
-- TOC entry 503 (class 1259 OID 179212)
-- Name: mv_duplicate_entity_detail_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.mv_duplicate_entity_detail_view (
    "GroupId" text,
    duplicate_path text,
    entity_id text,
    size_tb double precision,
    cost_usd double precision,
    "DataSourceName" text,
    "FileType" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'mv_duplicate_entity_detail_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_entity_detail_view ALTER COLUMN "GroupId" OPTIONS (
    column_name 'GroupId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_entity_detail_view ALTER COLUMN duplicate_path OPTIONS (
    column_name 'duplicate_path'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_entity_detail_view ALTER COLUMN entity_id OPTIONS (
    column_name 'entity_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_entity_detail_view ALTER COLUMN size_tb OPTIONS (
    column_name 'size_tb'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_entity_detail_view ALTER COLUMN cost_usd OPTIONS (
    column_name 'cost_usd'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_entity_detail_view ALTER COLUMN "DataSourceName" OPTIONS (
    column_name 'DataSourceName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_entity_detail_view ALTER COLUMN "FileType" OPTIONS (
    column_name 'FileType'
);


--
-- TOC entry 504 (class 1259 OID 179215)
-- Name: mv_duplicate_savings_by_original_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.mv_duplicate_savings_by_original_view (
    "GroupId" text,
    original_path text,
    duplicate_file_count integer,
    savings_size_tb double precision,
    savings_cost_usd double precision,
    "DataSourceType" text,
    "Type" text,
    "Category" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'mv_duplicate_savings_by_original_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_savings_by_original_view ALTER COLUMN "GroupId" OPTIONS (
    column_name 'GroupId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_savings_by_original_view ALTER COLUMN original_path OPTIONS (
    column_name 'original_path'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_savings_by_original_view ALTER COLUMN duplicate_file_count OPTIONS (
    column_name 'duplicate_file_count'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_savings_by_original_view ALTER COLUMN savings_size_tb OPTIONS (
    column_name 'savings_size_tb'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_savings_by_original_view ALTER COLUMN savings_cost_usd OPTIONS (
    column_name 'savings_cost_usd'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_savings_by_original_view ALTER COLUMN "DataSourceType" OPTIONS (
    column_name 'DataSourceType'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_savings_by_original_view ALTER COLUMN "Type" OPTIONS (
    column_name 'Type'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_duplicate_savings_by_original_view ALTER COLUMN "Category" OPTIONS (
    column_name 'Category'
);


--
-- TOC entry 505 (class 1259 OID 179218)
-- Name: mv_entity_category_summary_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.mv_entity_category_summary_view (
    "EntityCategory" text,
    "TermLabel" text,
    "DataSourceName" text,
    "DataSourceType" text,
    "Category" text,
    "Type" text,
    entity_count bigint,
    total_size_tb double precision,
    total_cost_usd double precision
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'mv_entity_category_summary_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_entity_category_summary_view ALTER COLUMN "EntityCategory" OPTIONS (
    column_name 'EntityCategory'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_entity_category_summary_view ALTER COLUMN "TermLabel" OPTIONS (
    column_name 'TermLabel'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_entity_category_summary_view ALTER COLUMN "DataSourceName" OPTIONS (
    column_name 'DataSourceName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_entity_category_summary_view ALTER COLUMN "DataSourceType" OPTIONS (
    column_name 'DataSourceType'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_entity_category_summary_view ALTER COLUMN "Category" OPTIONS (
    column_name 'Category'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_entity_category_summary_view ALTER COLUMN "Type" OPTIONS (
    column_name 'Type'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_entity_category_summary_view ALTER COLUMN entity_count OPTIONS (
    column_name 'entity_count'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_entity_category_summary_view ALTER COLUMN total_size_tb OPTIONS (
    column_name 'total_size_tb'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_entity_category_summary_view ALTER COLUMN total_cost_usd OPTIONS (
    column_name 'total_cost_usd'
);


--
-- TOC entry 506 (class 1259 OID 179221)
-- Name: mv_master; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.mv_master (
    "Category" text,
    "DataSourceName" text,
    "DataSourceType" text,
    "DataSourceCostPerTbCurrency" text,
    "DataSourceCostPerTbPrice" integer,
    "FileType" text,
    "Type" text,
    "ConversionRateToUSD" double precision,
    "Sensitivity" text,
    "Total IDs" bigint,
    "Total Size (Bytes)" double precision,
    "Total Size (TB)" double precision,
    "Total Cost" double precision
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'mv_master'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_master ALTER COLUMN "Category" OPTIONS (
    column_name 'Category'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_master ALTER COLUMN "DataSourceName" OPTIONS (
    column_name 'DataSourceName'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_master ALTER COLUMN "DataSourceType" OPTIONS (
    column_name 'DataSourceType'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_master ALTER COLUMN "DataSourceCostPerTbCurrency" OPTIONS (
    column_name 'DataSourceCostPerTbCurrency'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_master ALTER COLUMN "DataSourceCostPerTbPrice" OPTIONS (
    column_name 'DataSourceCostPerTbPrice'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_master ALTER COLUMN "FileType" OPTIONS (
    column_name 'FileType'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_master ALTER COLUMN "Type" OPTIONS (
    column_name 'Type'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_master ALTER COLUMN "ConversionRateToUSD" OPTIONS (
    column_name 'ConversionRateToUSD'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_master ALTER COLUMN "Sensitivity" OPTIONS (
    column_name 'Sensitivity'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_master ALTER COLUMN "Total IDs" OPTIONS (
    column_name 'Total IDs'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_master ALTER COLUMN "Total Size (Bytes)" OPTIONS (
    column_name 'Total Size (Bytes)'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_master ALTER COLUMN "Total Size (TB)" OPTIONS (
    column_name 'Total Size (TB)'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_master ALTER COLUMN "Total Cost" OPTIONS (
    column_name 'Total Cost'
);


--
-- TOC entry 507 (class 1259 OID 179224)
-- Name: mv_policies_summary; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.mv_policies_summary (
    "Level1_Name" text,
    "Level2_Name" text,
    "Level3_Name" text,
    "MasterView_ID_Count" bigint
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'mv_policies_summary'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_policies_summary ALTER COLUMN "Level1_Name" OPTIONS (
    column_name 'Level1_Name'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_policies_summary ALTER COLUMN "Level2_Name" OPTIONS (
    column_name 'Level2_Name'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_policies_summary ALTER COLUMN "Level3_Name" OPTIONS (
    column_name 'Level3_Name'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.mv_policies_summary ALTER COLUMN "MasterView_ID_Count" OPTIONS (
    column_name 'MasterView_ID_Count'
);


--
-- TOC entry 508 (class 1259 OID 179227)
-- Name: pipeline_control; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.pipeline_control (
    view_name text NOT NULL,
    last_successful_started_at timestamp without time zone NOT NULL,
    last_job_id text NOT NULL
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'pipeline_control'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.pipeline_control ALTER COLUMN view_name OPTIONS (
    column_name 'view_name'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.pipeline_control ALTER COLUMN last_successful_started_at OPTIONS (
    column_name 'last_successful_started_at'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.pipeline_control ALTER COLUMN last_job_id OPTIONS (
    column_name 'last_job_id'
);


--
-- TOC entry 509 (class 1259 OID 179230)
-- Name: pipeline_log; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.pipeline_log (
    job_id text NOT NULL,
    view_name text NOT NULL,
    started_at timestamp without time zone NOT NULL,
    completed_at timestamp without time zone,
    status text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'pipeline_log'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.pipeline_log ALTER COLUMN job_id OPTIONS (
    column_name 'job_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.pipeline_log ALTER COLUMN view_name OPTIONS (
    column_name 'view_name'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.pipeline_log ALTER COLUMN started_at OPTIONS (
    column_name 'started_at'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.pipeline_log ALTER COLUMN completed_at OPTIONS (
    column_name 'completed_at'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.pipeline_log ALTER COLUMN status OPTIONS (
    column_name 'status'
);


--
-- TOC entry 510 (class 1259 OID 179233)
-- Name: policies_summary_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.policies_summary_view (
    _id text NOT NULL,
    "Name" text,
    "Type" text,
    "Parent" text,
    "Fqdn" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'policies_summary_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.policies_summary_view ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.policies_summary_view ALTER COLUMN "Name" OPTIONS (
    column_name 'Name'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.policies_summary_view ALTER COLUMN "Type" OPTIONS (
    column_name 'Type'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.policies_summary_view ALTER COLUMN "Parent" OPTIONS (
    column_name 'Parent'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.policies_summary_view ALTER COLUMN "Fqdn" OPTIONS (
    column_name 'Fqdn'
);


--
-- TOC entry 511 (class 1259 OID 179236)
-- Name: terms_policies_view; Type: FOREIGN TABLE; Schema: bidb_ext_demo; Owner: -
--

CREATE FOREIGN TABLE bidb_ext_demo.terms_policies_view (
    _id bigint NOT NULL,
    "TermId" text,
    "PolicyId" text
)
SERVER remote_bidb
OPTIONS (
    schema_name 'public',
    table_name 'terms_policies_view'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.terms_policies_view ALTER COLUMN _id OPTIONS (
    column_name '_id'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.terms_policies_view ALTER COLUMN "TermId" OPTIONS (
    column_name 'TermId'
);
ALTER FOREIGN TABLE ONLY bidb_ext_demo.terms_policies_view ALTER COLUMN "PolicyId" OPTIONS (
    column_name 'PolicyId'
);


--
-- TOC entry 5097 (class 1259 OID 179346)
-- Name: idx_dim_datasource_key; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE UNIQUE INDEX idx_dim_datasource_key ON bidb_ext_demo.dim_datasource USING btree (datasource_key);


--
-- TOC entry 5098 (class 1259 OID 179348)
-- Name: idx_dim_date_full; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_dim_date_full ON bidb_ext_demo.dim_date USING btree (full_date);


--
-- TOC entry 5099 (class 1259 OID 179347)
-- Name: idx_dim_date_key; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE UNIQUE INDEX idx_dim_date_key ON bidb_ext_demo.dim_date USING btree (date_key);


--
-- TOC entry 5090 (class 1259 OID 179367)
-- Name: idx_dim_entity_filetype; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_dim_entity_filetype ON bidb_ext_demo.dim_entity USING btree (filetype);


--
-- TOC entry 5091 (class 1259 OID 179343)
-- Name: idx_dim_entity_key; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE UNIQUE INDEX idx_dim_entity_key ON bidb_ext_demo.dim_entity USING btree (entity_key);


--
-- TOC entry 5092 (class 1259 OID 179344)
-- Name: idx_dim_entity_nk; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_dim_entity_nk ON bidb_ext_demo.dim_entity USING btree (entity_nk);


--
-- TOC entry 5093 (class 1259 OID 179369)
-- Name: idx_dim_entity_parent_path; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_dim_entity_parent_path ON bidb_ext_demo.dim_entity USING btree (parent_path);


--
-- TOC entry 5094 (class 1259 OID 179368)
-- Name: idx_dim_entity_path; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_dim_entity_path ON bidb_ext_demo.dim_entity USING btree (path);


--
-- TOC entry 5095 (class 1259 OID 179366)
-- Name: idx_dim_entity_resource_type; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_dim_entity_resource_type ON bidb_ext_demo.dim_entity USING btree (resource_type);


--
-- TOC entry 5096 (class 1259 OID 179365)
-- Name: idx_dim_entity_type; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_dim_entity_type ON bidb_ext_demo.dim_entity USING btree (entity_type);


--
-- TOC entry 5089 (class 1259 OID 179345)
-- Name: idx_dim_term_key; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE UNIQUE INDEX idx_dim_term_key ON bidb_ext_demo.dim_term USING btree (term_key);


--
-- TOC entry 5109 (class 1259 OID 179355)
-- Name: idx_fact_entity_snapshot_accessed_date; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_fact_entity_snapshot_accessed_date ON bidb_ext_demo.fact_entity_snapshot USING btree (accessed_date_key);


--
-- TOC entry 5110 (class 1259 OID 179353)
-- Name: idx_fact_entity_snapshot_created_date; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_fact_entity_snapshot_created_date ON bidb_ext_demo.fact_entity_snapshot USING btree (created_date_key);


--
-- TOC entry 5111 (class 1259 OID 179356)
-- Name: idx_fact_entity_snapshot_last_update_date; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_fact_entity_snapshot_last_update_date ON bidb_ext_demo.fact_entity_snapshot USING btree (last_update_date_key);


--
-- TOC entry 5112 (class 1259 OID 179357)
-- Name: idx_fact_entity_snapshot_last_update_statistics_date; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_fact_entity_snapshot_last_update_statistics_date ON bidb_ext_demo.fact_entity_snapshot USING btree (last_update_statistics_date_key);


--
-- TOC entry 5113 (class 1259 OID 179354)
-- Name: idx_fact_entity_snapshot_modified_date; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_fact_entity_snapshot_modified_date ON bidb_ext_demo.fact_entity_snapshot USING btree (modified_date_key);


--
-- TOC entry 5114 (class 1259 OID 179352)
-- Name: idx_fact_snap_composite; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_fact_snap_composite ON bidb_ext_demo.fact_entity_snapshot USING btree (entity_key, datasource_key, scanned_date_key);


--
-- TOC entry 5115 (class 1259 OID 179350)
-- Name: idx_fact_snap_datasource; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_fact_snap_datasource ON bidb_ext_demo.fact_entity_snapshot USING btree (datasource_key);


--
-- TOC entry 5116 (class 1259 OID 179351)
-- Name: idx_fact_snap_date; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_fact_snap_date ON bidb_ext_demo.fact_entity_snapshot USING btree (scanned_date_key);


--
-- TOC entry 5117 (class 1259 OID 179349)
-- Name: idx_fact_snap_entity; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_fact_snap_entity ON bidb_ext_demo.fact_entity_snapshot USING btree (entity_key);


--
-- TOC entry 5100 (class 1259 OID 179364)
-- Name: idx_fact_term_composite; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_fact_term_composite ON bidb_ext_demo.fact_entity_term USING btree (entity_key, term_key, datasource_key);


--
-- TOC entry 5101 (class 1259 OID 179361)
-- Name: idx_fact_term_created; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_fact_term_created ON bidb_ext_demo.fact_entity_term USING btree (created_date_key);


--
-- TOC entry 5102 (class 1259 OID 179360)
-- Name: idx_fact_term_datasource; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_fact_term_datasource ON bidb_ext_demo.fact_entity_term USING btree (datasource_key);


--
-- TOC entry 5103 (class 1259 OID 179358)
-- Name: idx_fact_term_entity; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_fact_term_entity ON bidb_ext_demo.fact_entity_term USING btree (entity_key);


--
-- TOC entry 5104 (class 1259 OID 179362)
-- Name: idx_fact_term_modified; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_fact_term_modified ON bidb_ext_demo.fact_entity_term USING btree (modified_date_key);


--
-- TOC entry 5105 (class 1259 OID 179363)
-- Name: idx_fact_term_scanned; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_fact_term_scanned ON bidb_ext_demo.fact_entity_term USING btree (scanned_date_key);


--
-- TOC entry 5106 (class 1259 OID 179359)
-- Name: idx_fact_term_term; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_fact_term_term ON bidb_ext_demo.fact_entity_term USING btree (term_key);


--
-- TOC entry 5082 (class 1259 OID 179339)
-- Name: idx_stg_created_ts; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_stg_created_ts ON bidb_ext_demo.mv_stg_entity_term USING btree (created_ts);


--
-- TOC entry 5083 (class 1259 OID 179337)
-- Name: idx_stg_datasource_nk; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_stg_datasource_nk ON bidb_ext_demo.mv_stg_entity_term USING btree (datasource_nk);


--
-- TOC entry 5084 (class 1259 OID 179342)
-- Name: idx_stg_entity_datasource; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_stg_entity_datasource ON bidb_ext_demo.mv_stg_entity_term USING btree (entity_nk, datasource_nk);


--
-- TOC entry 5085 (class 1259 OID 179336)
-- Name: idx_stg_entity_nk; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_stg_entity_nk ON bidb_ext_demo.mv_stg_entity_term USING btree (entity_nk);


--
-- TOC entry 5086 (class 1259 OID 179340)
-- Name: idx_stg_modified_ts; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_stg_modified_ts ON bidb_ext_demo.mv_stg_entity_term USING btree (modified_ts);


--
-- TOC entry 5087 (class 1259 OID 179341)
-- Name: idx_stg_scanned_ts; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_stg_scanned_ts ON bidb_ext_demo.mv_stg_entity_term USING btree (scanned_ts);


--
-- TOC entry 5088 (class 1259 OID 179338)
-- Name: idx_stg_term_name; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX idx_stg_term_name ON bidb_ext_demo.mv_stg_entity_term USING btree (lower(TRIM(BOTH FROM term_name)));


--
-- TOC entry 5118 (class 1259 OID 179334)
-- Name: ix_fact_entity_snapshot_entity; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX ix_fact_entity_snapshot_entity ON bidb_ext_demo.fact_entity_snapshot USING btree (entity_key);


--
-- TOC entry 5119 (class 1259 OID 179335)
-- Name: ix_fact_entity_snapshot_scandate; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX ix_fact_entity_snapshot_scandate ON bidb_ext_demo.fact_entity_snapshot USING btree (scanned_date_key);


--
-- TOC entry 5107 (class 1259 OID 179332)
-- Name: ix_fact_entity_term_term; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE INDEX ix_fact_entity_term_term ON bidb_ext_demo.fact_entity_term USING btree (term_key);


--
-- TOC entry 5120 (class 1259 OID 179333)
-- Name: ux_fact_entity_snapshot; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE UNIQUE INDEX ux_fact_entity_snapshot ON bidb_ext_demo.fact_entity_snapshot USING btree (entity_key, scanned_date_key);


--
-- TOC entry 5108 (class 1259 OID 179331)
-- Name: ux_fact_entity_term; Type: INDEX; Schema: bidb_ext_demo; Owner: -
--

CREATE UNIQUE INDEX ux_fact_entity_term ON bidb_ext_demo.fact_entity_term USING btree (entity_key, term_key);


--
-- TOC entry 5276 (class 0 OID 179242)
-- Dependencies: 513 5285
-- Name: mv_stg_entity_term; Type: MATERIALIZED VIEW DATA; Schema: bidb_ext_demo; Owner: -
--

REFRESH MATERIALIZED VIEW bidb_ext_demo.mv_stg_entity_term;


--
-- TOC entry 5279 (class 0 OID 179277)
-- Dependencies: 516 5276 5285
-- Name: dim_datasource; Type: MATERIALIZED VIEW DATA; Schema: bidb_ext_demo; Owner: -
--

REFRESH MATERIALIZED VIEW bidb_ext_demo.dim_datasource;


--
-- TOC entry 5281 (class 0 OID 179299)
-- Dependencies: 518 5276 5285
-- Name: dim_date; Type: MATERIALIZED VIEW DATA; Schema: bidb_ext_demo; Owner: -
--

REFRESH MATERIALIZED VIEW bidb_ext_demo.dim_date;


--
-- TOC entry 5278 (class 0 OID 179265)
-- Dependencies: 515 5276 5285
-- Name: dim_entity; Type: MATERIALIZED VIEW DATA; Schema: bidb_ext_demo; Owner: -
--

REFRESH MATERIALIZED VIEW bidb_ext_demo.dim_entity;


--
-- TOC entry 5280 (class 0 OID 179288)
-- Dependencies: 517 5276 5285
-- Name: dim_filetype; Type: MATERIALIZED VIEW DATA; Schema: bidb_ext_demo; Owner: -
--

REFRESH MATERIALIZED VIEW bidb_ext_demo.dim_filetype;


--
-- TOC entry 5277 (class 0 OID 179254)
-- Dependencies: 514 5276 5285
-- Name: dim_term; Type: MATERIALIZED VIEW DATA; Schema: bidb_ext_demo; Owner: -
--

REFRESH MATERIALIZED VIEW bidb_ext_demo.dim_term;


--
-- TOC entry 5283 (class 0 OID 179319)
-- Dependencies: 520 5276 5285
-- Name: fact_entity_snapshot; Type: MATERIALIZED VIEW DATA; Schema: bidb_ext_demo; Owner: -
--

REFRESH MATERIALIZED VIEW bidb_ext_demo.fact_entity_snapshot;


--
-- TOC entry 5282 (class 0 OID 179307)
-- Dependencies: 519 5276 5285
-- Name: fact_entity_term; Type: MATERIALIZED VIEW DATA; Schema: bidb_ext_demo; Owner: -
--

REFRESH MATERIALIZED VIEW bidb_ext_demo.fact_entity_term;


-- Completed on 2026-01-30 15:48:07 CST

--
-- PostgreSQL database dump complete
--

\unrestrict Px6G00OZPyyWyvHPZQOcjPTBFogmzXdrwKthp9GQDTvvxSq3f8omb2toMqUJKwN

