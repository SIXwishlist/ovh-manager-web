angular.module("App").controller(
    "DomainZoneRecordCtrl",
    class DomainZoneRecordAddCtrl {
        constructor ($scope, $rootScope, Alerter, Domain, DomainValidator, Validator) {
            this.$scope = $scope;
            this.$rootScope = $rootScope;
            this.Alerter = Alerter;
            this.Domain = Domain;
            this.DomainValidator = DomainValidator;
            this.Validator = Validator;
        }

        $onInit () {
            this.domain = this.$scope.currentActionData.domain;
            this.fieldTypes = this.$scope.currentActionData.fieldTypes;
            this.edit = this.$scope.currentActionData.edit || false;
            this.subdomainPreset = this.$scope.currentActionData.subdomainPreset || "";

            this.loading = {
                checkSubDomain: false,
                resume: false
            };
            this.model = {
                fieldType: this.edit ? this.edit.fieldType : null,
                subDomainToDisplay: this.subdomainPreset,
                target: {}
            };
            this.recordConflicts = false;
            this.recordPreview = "";

            // If the ttl is 0 or not set, the ttlSelect is ALWAYS "global"
            if (this.edit && this.edit.ttl) {
                this.model.ttlSelect = "custom";
                this.model.ttl = parseInt(this.edit.ttl, 10);
            } else {
                this.model.ttlSelect = "global";
                this.model.ttl = 0;
            }
            this.isCustomTtlWithValueZero();

            if (this.edit) {
                this.loadEditModel(this.model.fieldType);
            }

            this.$scope.backToStep1 = () => {
                this.model.fieldType = null;
                this.$scope.$emit("wizard-goToStep", 1);
            };
            this.$scope.checkIfRecordCanBeAdd = () => this.checkIfRecordCanBeAdd();
            this.$scope.initializeTarget = () => this.initializeTarget();
            this.$scope.addDnsEntry = () => this.addDnsEntry();
            this.$scope.editDnsEntry = () => this.editDnsEntry();
            this.$scope.generateTarget = () => this.generateTarget();

            // Watch Target fields, and generate the value with them
            this.$scope.$watch(
                angular.bind(this, () => [this.model.fieldType, this.model.subDomainToDisplay, this.model.ttl, this.model.target.value]),
                () => {
                    this.generateTarget();
                },
                true
            );
        }

        initializeTarget () {
            this.model.target = {};
            if (this.model.fieldType.toLowerCase() === "dkim") {
                this.model.target.t = { y: false, s: true };
            }
            this.setTargetValue(this.model.fieldType);
        }

        checkIfRecordCanBeAdd () {
            if (~["A", "AAAA", "CNAME", "NS"].indexOf(this.model.fieldType)) {
                this.loading.resume = true;
                this.Domain
                    .checkIfRecordCanBeAdd(this.domain.name, {
                        excludeId: this.edit ? this.edit.id : undefined, // for edition, we need to exclude this id
                        fieldType: this.model.fieldType,
                        subDomain: punycode.toASCII(this.model.subDomainToDisplay || ""),
                        target: this.model.target.value
                    })
                    .then((isOk) => {
                        this.recordConflicts = isOk;
                    })
                    .finally(() => {
                        this.loading.resume = false;
                    });
            } else {
                this.recordConflicts = true;
            }
        }

        checkMxTarget (input) {
            const value = _.get(this.model, "target.target");
            input.$setValidity("target", value === null || value === "" || this.DomainValidator.isValidMXTarget(value));
        }

        checkNaptrReplaceField (input) {
            const value = _.get(this.model, "target.replace");
            input.$setValidity("replace", value === null || value === "" || this.DomainValidator.isValidReplaceNaptr(value));
        }

        checkSpfField (input, fieldType) {
            const value = input.$viewValue;
            let isValid = true;

            if (value) {
                const splitted = value.replace(/\s{2,}/g, " ").split(/\s/);
                for (let i = 0; i < splitted.length; i++) {
                    const fieldFormatted = this.DomainValidator.constructor.getSpfFieldFormatted(splitted[i], fieldType);
                    if (splitted[i] === fieldType || !this.DomainValidator.SPF[`isValid${fieldType.toUpperCase()}`](fieldFormatted)) {
                        isValid = false;
                    }
                }
            }
            input.$setValidity(`field-${fieldType}`, isValid);
        }

        checkSrvTarget (input) {
            const value = _.get(this.model, "target.target");
            let isValid;

            if (this.DomainValidator.regex.SRV_target.test(value)) {
                isValid = this.Validator.isValidDomain(value.match(this.DomainValidator.regex.SRV_target)[1]);
            } else {
                isValid = this.Validator.isValidSubDomain(value);
            }
            input.$setValidity("target", isValid);
        }

        checkSubDomainToDisplay (input) {
            const value = angular.copy(this.model.subDomainToDisplay);
            input.$setValidity("subdomain", value === null || value === "" || this.Validator.isValidSubDomain(value, { canBeginWithUnderscore: true, canBeginWithWildcard: true }));

            // Test already existing subDomain field
            if (!this.loading.checkSubDomain) {
                this.loading.checkSubDomain = true;
                const checkExistingSubDomain = _.debounce(() => this.checkExistingSubDomain(), 600);
                checkExistingSubDomain();
            }
        }

        checkExistingSubDomain () {
            if (!!_.find(["A", "AAAA"], (entry) => entry === this.model.fieldType) && _.isString(this.model.subDomainToDisplay)) {
                return this.Domain
                    .getTabZoneDns(this.domain.name, 100, 0, this.model.subDomainToDisplay)
                    .then((results) => {
                        const subDomain = angular.copy(this.model.subDomainToDisplay).toLowerCase();
                        this.existingSubDomain = _.filter(results.paginatedZone.records.results, (zone) => zone.subDomain.toLowerCase() === subDomain);
                    })
                    .finally(() => {
                        this.loading.checkSubDomain = false;
                    });
            }
            return false;
        }

        checkTarget (input, type) {
            const value = input.$viewValue;
            input.$setValidity("target", value === null || value === "" || this.DomainValidator.isValidTarget(value, type));
        }

        isAvailableFieldType (fieldType) {
            return this.fieldTypes && ~this.fieldTypes.indexOf(fieldType);
        }

        isCustomTtlWithValueZero () {
            this.ttlZero = this.model.ttlSelect === "custom" && this.model.ttl === 0;
        }

        generateTarget () {
            this.recordPreview = [
                this.model.subDomainToDisplay ? punycode.toASCII(this.model.subDomainToDisplay) : "",
                this.model.ttlSelect === "custom" && this.model.ttl !== null ? this.model.ttl : "",
                "IN",
                ~["SPF", "DKIM", "DMARC"].indexOf(this.model.fieldType) ? "TXT" : this.model.fieldType, // Some field types uses other field types...
                ~["SPF", "DKIM", "DMARC"].indexOf(this.model.fieldType) ? `"${this.model.target.value || ""}"` : this.model.target.value || ""
            ]
                .join(" ")
                .replace(/\s{2,}/g, " ")
                .trim();
        }

        getResumeDomain () {
            return `${this.model.subDomainToDisplay ? `${this.model.subDomainToDisplay}.` : ""}${this.domain.displayName}.`;
        }

        getResumeTargetAlert () {
            if (this.model.target && /[^\.]$/.test(this.model.target.value) && ~["NS", "CNAME", "SRV", "MX"].indexOf(this.model.fieldType)) {
                return `${this.model.target.target}.${this.domain.displayName}.`;
            }
            return false;
        }

        loadEditModel (fieldType) {
            this.model.subDomainToDisplay = _.get(this.edit, "subDomainToDisplay");

            switch (fieldType.toUpperCase()) {
            case "A":
            case "AAAA":
            case "TXT":
            case "CNAME":
            case "NS":
                this.model.target.target = this.edit.targetToDisplay;
                break;
            case "DKIM":
                if (!this.DomainValidator.regex.DKIM.test(this.edit.targetToDisplay)) {
                    break;
                }
                this.loadDkimModel(this.edit.targetToDisplay);
                break;
            case "DMARC":
                if (!this.DomainValidator.regex.DMARC.test(this.edit.targetToDisplay)) {
                    break;
                }
                this.loadDmarcModel(this.edit.targetToDisplay);
                break;
            case "LOC":
                this.loadLocModel(this.edit.targetToDisplay);
                break;
            case "MX":
                this.loadMxModel(this.edit.targetToDisplay);
                break;
            case "NAPTR":
                this.loadNaptrModel(this.edit.target); // do not test "targetToDisplay" here, but "target".
                break;
            case "SPF":
                this.loadSpfModel(this.edit.targetToDisplay);
                break;
            case "SRV":
                this.loadSrvModel(this.edit.targetToDisplay);
                break;
            case "SSHFP":
                this.loadSshfpModel(this.edit.targetToDisplay);
                break;
            case "TLSA":
                this.loadTslaModel(this.edit.targetToDisplay);
                break;
            default:
            }
            this.setTargetValue(fieldType);
        }

        loadDkimModel (target) {
            const splitted = target.replace(/(;)$/, "").split(";");

            if (splitted) {
                for (let i = 0; i < splitted.length; i++) {
                    // splitting value with "=" char will break base64 values ...
                    // so here we split only with the first "=" occurence (key=value)
                    const splittedVal = splitted[i].trim().split(/\=(.+)?/).slice(0, -1).map(_.trim);

                    switch (splittedVal[0]) {
                    case "v":
                        if (!this.model.target.v) {
                            this.model.target.v = {};
                        }
                        this.model.target.v[splittedVal[1]] = true;
                        break;
                    case "g":
                        this.model.target.g = splittedVal[1];
                        break;
                    case "h":
                        if (!this.model.target.h) {
                            this.model.target.h = {};
                        }
                        if (splittedVal[1] === "*" || ~splittedVal[1].indexOf(":")) {
                            this.model.target.h.sha1 = true;
                            this.model.target.h.sha256 = true;
                        } else {
                            this.model.target.h[splittedVal[1]] = true;
                        }
                        break;
                    case "k":
                        if (!this.model.target.k) {
                            this.model.target.k = {};
                        }
                        this.model.target.k[splittedVal[1]] = true;
                        break;
                    case "n":
                        this.model.target.n = splittedVal[1];
                        break;
                    case "p":
                        this.model.target.p = splittedVal[1];
                        if (splittedVal[1] === "") {
                            this.model.target.pRevoke = true;
                        }
                        break;
                    case "s":
                        this.model.target.s = splittedVal[1];
                        break;
                    case "t":
                        if (!this.model.target.t) {
                            this.model.target.t = { y: false, s: false };
                        }
                        if (~splittedVal[1].indexOf(":")) {
                            this.model.target.t.y = true;
                            this.model.target.t.s = true;
                        } else {
                            this.model.target.t[splittedVal[1]] = true;
                        }
                        break;
                    default:
                    }
                }
            }
        }

        loadDmarcModel (target) {
            const splitted = target.replace(/(;)$/, "").split(";");

            if (splitted) {
                for (let i = 0; i < splitted.length; i++) {
                    const splittedVal = splitted[i].trim().split(/\=(.+)?/).slice(0, -1).map(_.trim);
                    switch (splittedVal[0]) {
                    case "v":
                        this.model.target.v = "DMARC1";
                        break;
                    case "p":
                        this.model.target.p = splittedVal[1] || "";
                        break;
                    case "pct":
                        this.model.target.pct = parseInt(splittedVal[1], 10);
                        break;
                    case "rua":
                        this.model.target.rua = splittedVal[1] || "";
                        break;
                    case "sp":
                        this.model.target.sp = splittedVal[1] || "";
                        break;
                    case "aspf":
                        this.model.target.aspf = splittedVal[1];
                        break;
                    default:
                    }
                }
            }
        }

        loadLocModel (target) {
            const splitted = target.match(this.DomainValidator.regex.LOC);
            if (_.isArray(splitted) && splitted.length > 0) {
                this.model.target.lat_deg = parseInt(splitted[1], 10) || "";
                this.model.target.lat_min = parseInt(splitted[2], 10) || "";
                this.model.target.lat_sec = parseFloat(splitted[3]) || "";
                this.model.target.latitude = splitted[4] || "";
                this.model.target.long_deg = parseInt(splitted[5], 10) || "";
                this.model.target.long_min = parseInt(splitted[6], 10) || "";
                this.model.target.long_sec = parseFloat(splitted[7]) || "";
                this.model.target.longitude = splitted[8] || "";
                this.model.target.altitude = parseFloat(splitted[9]) || "";
                this.model.target.size = parseFloat(splitted[10]) || "";
                this.model.target.hp = parseFloat(splitted[11]) || "";
                this.model.target.vp = parseFloat(splitted[12]) || "";
            }
        }

        loadMxModel (target) {
            const splitted = target.match(this.DomainValidator.regex.MX);
            if (_.isArray(splitted) && splitted.length > 0) {
                this.model.target.priority = parseInt(splitted[1], 10);
                this.model.target.target = splitted[2];
            }
        }

        loadNaptrModel (target) {
            const splitted = target.match(this.DomainValidator.regex.NAPTR); // todo: exclude dot!
            if (_.isArray(splitted) && splitted.length > 0) {
                this.model.target.order = parseInt(splitted[1], 10) || "";
                this.model.target.pref = parseInt(splitted[2], 10) || "";
                this.model.target.flag = splitted[3] || "";
                this.model.target.service = splitted[4] || "";
                this.model.target.regex = splitted[5] ? splitted[5].replace(/\\{2,}/g, "\\") : null;
                this.model.target.replace = splitted[6] === "." ? "" : splitted[6]; // If only ".": hide
            }
        }

        loadSpfModel (target) {
            const splitted = target.replace(/\s{2,}/g, " ").replace(/^"(.*)"$/, "$1").trim().split(/\s/);
            if (_.isArray(splitted) && splitted.length > 0) {
                _.forEach(["a", "mx", "ptr"], (fieldType) => {
                    if (~splitted.indexOf(fieldType)) {
                        this.model.target[`${fieldType}Sender`] = true;
                        splitted.splice(splitted.indexOf(fieldType), 1);
                    } else {
                        this.model.target[`${fieldType}Sender`] = false;
                    }
                });

                // Begin at "i = 1" because exclude first field (v=spf1)
                for (let i = 1; i < splitted.length; i++) {
                    let found = false;

                    // Test "a", "mx", "ptr", "ip4", "ip6", "include", "exists", "redirect", "exp" fields
                    _.forEach(["a", "mx", "ptr", "ip4", "ip6", "include"], (fieldType) => {
                        if (!found && this.DomainValidator.regex.SPF_sender[fieldType.toUpperCase()].test(splitted[i])) {
                            found = true;
                            if (!this.model.target[fieldType]) {
                                this.model.target[fieldType] = "";
                            }
                            this.model.target[fieldType] += ` ${splitted[i]}`;
                            this.model.target[fieldType] = this.model.target[fieldType].trim();
                        }
                    });

                    // Test "all": it"s the only last possible field
                    if (!found && this.DomainValidator.regex.SPF_all.test(splitted[i])) {
                        this.model.target.all = splitted[i];
                    }
                }
            }
        }

        loadSrvModel (target) {
            const splitted = target.match(this.DomainValidator.regex.SRV); // todo: exclude dot!
            if (_.isArray(splitted) && splitted.length > 0) {
                this.model.target.priority = parseInt(splitted[1], 10) || "";
                this.model.target.weight = parseInt(splitted[2], 10) || "";
                this.model.target.port = parseInt(splitted[3], 10) || "";
                this.model.target.target = splitted[4] || "";
            }
        }

        loadSshfpModel (target) {
            const splitted = target.match(this.DomainValidator.regex.SSHFP);
            if (_.isArray(splitted) && splitted.length > 0) {
                this.model.target.algorithm = splitted[1] || "";
                this.model.target.fptype = splitted[2] || "";
                this.model.target.fp = splitted[3] || "";
            }
        }

        loadTslaModel (target) {
            const splitted = target.match(this.DomainValidator.regex.TLSA);
            if (_.isArray(splitted) && splitted.length > 0) {
                this.model.target.usage = parseInt(splitted[1], 10) || "";
                this.model.target.selector = parseInt(splitted[2], 10) || "";
                this.model.target.matchingType = parseInt(splitted[3], 10) || "";
                this.model.target.certificateData = splitted[4];
            }
        }

        selectFieldType (fieldType) {
            this.model.fieldType = fieldType;
            this.model.subDomainToDisplay = null;
            this.model.ttlSelect = "global";
            this.model.ttl = 0;
            this.initializeTarget();
            this.$scope.$emit("wizard-goToStep", 3);
        }

        setTargetValue (fieldType) {
            switch (fieldType.toLowerCase()) {
            case "txt": {
                const search = this.model.target.target && this.model.target.target.match(this.DomainValidator.regex.TXT);
                this.model.target.value = search && search.length >= 2 ? `"${search[1]}"` : null;
                break;
            }
            case "cname":
            case "ns":
                this.model.target.value = punycode.toASCII(this.model.target.target || "");
                break;
            case "dkim":
                this.model.target.value = this.DomainValidator.constructor.transformDKIMTarget(this.model.target);
                break;
            case "dmarc":
                this.model.target.value = this.DomainValidator.constructor.transformDMARCTarget(this.model.target);
                break;
            case "loc":
                this.model.target.value = this.DomainValidator.constructor.transformLOCTarget(this.model.target);
                break;
            case "mx":
                this.model.target.value = this.DomainValidator.constructor.transformMXTarget(this.model.target);
                break;
            case "naptr":
                this.model.target.value = this.DomainValidator.constructor.transformNAPTRTarget(this.model.target);
                break;
            case "spf":
                this.model.target.value = this.DomainValidator.constructor.transformSPFTarget(this.model.target);
                break;
            case "srv":
                this.model.target.value = this.DomainValidator.constructor.transformSRVTarget(this.model.target);
                break;
            case "sshfp":
                this.model.target.value = this.DomainValidator.constructor.transformSSHFPTarget(this.model.target);
                break;
            case "tlsa":
                this.model.target.value = this.DomainValidator.constructor.transformTLSATarget(this.model.target);
                break;
            default:
                this.model.target.value = this.model.target.target || "";
            }
        }

        setTtlConfiguration () {
            if (this.model.ttlSelect === "global") {
                this.model.ttl = 0;
            } else if (!this.model.ttl) {
                this.model.ttl = 60; // minimal ttl value (from api)
            }
        }

        switchTargetToAbsolute () {
            this.model.target.target += ".";
            this.setTargetValue(this.model.fieldType);
        }

        targetIsRelativeDomain () {
            return this.model.target.target && /\..*[^\.]$/.test(this.model.target.target);
        }

        useSpfOvh () {
            this.model.target = {};
            this.model.target.include = "mx.ovh.com";
            this.model.target.all = "~all";
            this.setTargetValue("spf");
            this.checkIfRecordCanBeAdd();
            this.$scope.$emit("wizard-goToStep", this.edit ? 3 : 4);
        }

        // Add DNS ----------------------------------------------------------------
        addDnsEntry () {
            return this.Domain
                .addDnsEntry(this.domain.name, {
                    fieldType: this.model.fieldType,
                    subDomainToDisplay: this.model.subDomainToDisplay,
                    ttl: this.model.ttl,
                    target: this.model.target.value
                })
                .then(() => {
                    this.Alerter.success(this.$scope.tr("domain_configuration_dns_entry_add_success"), this.$scope.alerts.dashboard);
                })
                .catch((err) => {
                    this.Alerter.alertFromSWS(this.$scope.tr("domain_configuration_dns_entry_add_fail"), err, this.$scope.alerts.dashboard);
                })
                .finally(() => {
                    this.$scope.resetAction();
                });
        }

        // Update DNS -------------------------------------------------------------
        editDnsEntry () {
            return this.Domain
                .modifyDnsEntry(this.domain.name, {
                    id: this.edit.id,
                    fieldType: this.model.fieldType,
                    subDomainToDisplay: this.model.subDomainToDisplay,
                    ttl: this.model.ttl,
                    target: this.model.target.value
                })
                .then(() => {
                    this.Alerter.success(this.$scope.tr("domain_configuration_dns_entry_modify_success"), this.$scope.alerts.dashboard);
                    this.$rootScope.$broadcast("domain.tabs.zonedns.refresh");
                })
                .catch((err) => {
                    this.Alerter.alertFromSWS(this.$scope.tr("domain_configuration_dns_entry_modify_fail"), err, this.$scope.alerts.dashboard);
                })
                .finally(() => {
                    this.$scope.resetAction();
                });
        }
    }
);