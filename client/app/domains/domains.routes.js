angular.module("App").config(($stateProvider) => {
    "use strict";

    $stateProvider.state("app.domains.all", {
        url: "/configuration/domains",
        templateUrl: "domains/domains.html",
        controller: "DomainsCtrl",
        controllerAs: "ctrlDomains",
        resolve: {
            navigationInformations: [
                "Navigator",
                "$rootScope",
                (Navigator, $rootScope) => {
                    $rootScope.currentSectionInformation = "domains";
                    return Navigator.setNavigationInformation({
                        leftMenuVisible: true,
                        configurationSelected: true
                    });
                }
            ],
            translator: ["translator", (translator) => translator.load(["domain", "domains"]).then(() => translator)]
        }
    });
});
