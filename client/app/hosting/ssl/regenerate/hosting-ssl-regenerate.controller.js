angular
    .module("App")
    .controller("hostingRegenerateSSLCtrl", class HostingRegenerateSSLCtrl {
        constructor ($scope, $stateParams, Hosting, Alerter, translator) {
            this.$scope = $scope;

            this.$stateParams = $stateParams;
            this.Hosting = Hosting;
            this.Alerter = Alerter;
            this.translator = translator;
        }

        $onInit () {
            this.$scope.regeneratingCertificate = () => this.regeneratingCertificate();
        }

        regeneratingCertificate () {
            return this.Hosting.regeneratingSSL(this.$stateParams.productId)
                .then(() => {
                    this.$scope.loadSsl();
                    this.Alerter.success(this.translator.tr("hosting_dashboard_service_regenerate_ssl_success"), this.$scope.alerts.main);
                })
                .catch((err) => {
                    this.Alerter.alertFromSWS(this.translator.tr("hosting_dashboard_service_regenerate_ssl_error"), err.data, this.$scope.alerts.main);
                })
                .finally(() => {
                    this.$scope.resetAction();
                });
        }
    });
