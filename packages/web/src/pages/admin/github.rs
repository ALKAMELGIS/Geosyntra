use dioxus::prelude::*;

use crate::{
    api::github::{
        github_issues, github_pulls, github_repos, github_status, oauth_start_url, GitHubIssue,
        GitHubPull, GitHubRepo,
    },
    components::admin::AdminShell,
    error_display::display_api_error,
};

async fn fetch_repo_details(owner: &str, repo: &str) -> (Vec<GitHubIssue>, Vec<GitHubPull>) {
    let issues = github_issues(owner, repo).await.unwrap_or_default();
    let pulls = github_pulls(owner, repo).await.unwrap_or_default();
    (issues, pulls)
}

#[component]
pub fn AdminGitHub() -> Element {
    let mut connected = use_signal(|| false);
    let mut scope = use_signal(String::new);
    let mut repos = use_signal(Vec::<GitHubRepo>::new);
    let mut selected_repo = use_signal(String::new);
    let mut issues = use_signal(Vec::<GitHubIssue>::new);
    let mut pulls = use_signal(Vec::<GitHubPull>::new);
    let mut loading = use_signal(|| true);
    let mut error = use_signal(|| None::<String>);

    let reload_status = move || {
        spawn(async move {
            loading.set(true);
            match github_status().await {
                Ok(status) => {
                    connected.set(status.connected.unwrap_or(false));
                    scope.set(status.scope.unwrap_or_default());
                    if status.connected.unwrap_or(false) {
                        if let Ok(items) = github_repos().await {
                            repos.set(items.clone());
                            let current = selected_repo.read().clone();
                            let pick = if current.is_empty() {
                                items
                                    .first()
                                    .and_then(|r| r.full_name.clone())
                                    .unwrap_or_default()
                            } else {
                                current
                            };
                            if !pick.is_empty() {
                                selected_repo.set(pick.clone());
                                let parts: Vec<&str> = pick.split('/').collect();
                                if parts.len() == 2 {
                                    let (issue_list, pull_list) =
                                        fetch_repo_details(parts[0], parts[1]).await;
                                    issues.set(issue_list);
                                    pulls.set(pull_list);
                                }
                            }
                        }
                    }
                    loading.set(false);
                }
                Err(err) => {
                    error.set(Some(display_api_error(&err)));
                    loading.set(false);
                }
            }
        });
    };

    use_effect(move || reload_status());

    rsx! {
        AdminShell {
            div { class: "gs-admin-page",
                h1 { class: "gs-page-title", "GitHub integration" }
                p { class: "gs-page-lead",
                    "Connect a GitHub account to browse repositories, issues, and pull requests."
                }

                if let Some(err) = error.read().clone() {
                    p { class: "gs-error", "{err}" }
                }

                if *loading.read() {
                    p { class: "gs-hint", "Loading GitHub status…" }
                } else if !*connected.read() {
                    div { class: "gs-card",
                        p { class: "gs-hint", "GitHub is not connected for this deployment." }
                        a {
                            class: "gs-btn gs-btn--primary",
                            href: "{oauth_start_url()}",
                            "Connect GitHub"
                        }
                    }
                } else {
                    p { class: "gs-hint", "Connected — scope: {scope}" }

                    div { class: "gs-field",
                        label { "Repository" }
                        select {
                            value: "{selected_repo}",
                            onchange: move |e| {
                                let repo_full = e.value();
                                selected_repo.set(repo_full.clone());
                                spawn(async move {
                                    let parts: Vec<&str> = repo_full.split('/').collect();
                                    if parts.len() != 2 {
                                        return;
                                    }
                                    let (issue_list, pull_list) =
                                        fetch_repo_details(parts[0], parts[1]).await;
                                    issues.set(issue_list);
                                    pulls.set(pull_list);
                                });
                            },
                            for repo in repos.read().iter().cloned() {
                                option {
                                    key: "{repo.full_name.clone().unwrap_or_default()}",
                                    value: "{repo.full_name.clone().unwrap_or_default()}",
                                    "{repo.full_name.clone().unwrap_or_default()}"
                                }
                            }
                        }
                    }

                    div { class: "gs-admin-grid gs-admin-grid--split",
                        div { class: "gs-card",
                            h2 { class: "gs-card-title", "Issues" }
                            if issues.read().is_empty() {
                                p { class: "gs-hint", "No open issues." }
                            } else {
                                ul { class: "gs-list",
                                    for issue in issues.read().iter().cloned() {
                                        li { key: "{issue.id.unwrap_or(0)}",
                                            if let Some(url) = issue.html_url.clone() {
                                                a { href: "{url}", target: "_blank", "{issue.title.clone().unwrap_or_default()}" }
                                            } else {
                                                "{issue.title.clone().unwrap_or_default()}"
                                            }
                                            span { class: "gs-hint", " #{issue.number.unwrap_or(0)}" }
                                        }
                                    }
                                }
                            }
                        }
                        div { class: "gs-card",
                            h2 { class: "gs-card-title", "Pull requests" }
                            if pulls.read().is_empty() {
                                p { class: "gs-hint", "No pull requests." }
                            } else {
                                ul { class: "gs-list",
                                    for pr in pulls.read().iter().cloned() {
                                        li { key: "{pr.id.unwrap_or(0)}",
                                            if let Some(url) = pr.html_url.clone() {
                                                a { href: "{url}", target: "_blank", "{pr.title.clone().unwrap_or_default()}" }
                                            } else {
                                                "{pr.title.clone().unwrap_or_default()}"
                                            }
                                            span { class: "gs-hint", " #{pr.number.unwrap_or(0)}" }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
