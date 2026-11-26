// Registration and sign-in UI (Lab 5 pattern, jQuery).
// Endpoints: /register, /signin, /signout, /validate.

window.Auth = (function () {
    let user = null;

    function init(onSignedIn) {
        $("#start-signin-button").on("click", function () {
            $("#auth-buttons").prop("hidden", true);
            $("#signin-form").prop("hidden", false);
            $("#register-form").prop("hidden", true);
            $("#signin-message").text("");
        });

        $("#start-register-button").on("click", function () {
            $("#auth-buttons").prop("hidden", true);
            $("#register-form").prop("hidden", false);
            $("#signin-form").prop("hidden", true);
            $("#register-message").text("");
        });

        $(".back-button").on("click", function () {
            $("#auth-buttons").prop("hidden", false);
            $("#register-form").prop("hidden", true);
            $("#signin-form").prop("hidden", true);
        });

        $("#register-button").on("click", function (event) {
            event.preventDefault();
            const username = $("#register-username").val().trim();
            const avatar = $("#register-avatar").val();
            const name = $("#register-name").val().trim();
            const password = $("#register-password").val().trim();
            const confirmPassword = $("#register-confirm").val().trim();

            if (password !== confirmPassword) {
                $("#register-message").text("Passwords do not match.");
                return;
            }
            fetch("/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, avatar, name, password })
            })
                .then((res) => res.json())
                .then((json) => {
                    console.log("Endpoint '/register' -", json); // FOR MARKING
                    if (json.error) {
                        $("#register-message").text(json.error);
                        return;
                    }
                    $("#register-form").get(0).reset();
                    $("#register-message").text("Registered. Please sign in.");
                });
        });

        $("#signin-button").on("click", function (event) {
            event.preventDefault();
            const username = $("#signin-username").val().trim();
            const password = $("#signin-password").val().trim();
            fetch("/signin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            })
                .then((res) => res.json())
                .then((json) => {
                    console.log("Endpoint '/signin' -", json); // FOR MARKING
                    if (json.error) {
                        $("#signin-message").text(json.error);
                        return;
                    }
                    setUser(json.user);
                    if (onSignedIn) onSignedIn(json.user);
                });
        });

        $("#signout-button").on("click", function () {
            fetch("/signout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}"
            }).then(() => setUser(null));
        });

        fetch("/validate")
            .then((res) => res.json())
            .then((json) => {
                if (json.user) {
                    setUser(json.user);
                    if (onSignedIn) onSignedIn(json.user);
                }
            });
    }

    function setUser(newUser) {
        user = newUser;
        const signedIn = !!user;
        $("#auth-buttons").toggle(!signedIn);
        $("#register-form").hide();
        $("#signin-form").hide();
        $("#signed-in-as").text(signedIn ? "Signed in as " + user.username : "Not signed in.");
        $("#signout-button").prop("hidden", !signedIn);
        $("#lobby-section").prop("hidden", !signedIn);
    }

    function getUser() {
        return user;
    }

    return { init, getUser };
})();
