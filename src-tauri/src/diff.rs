use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 变更类型
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChangeType {
    Added,
    Removed,
    Modified,
}

/// diff 树节点，path 形如 `$.a.b[0].c`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffNode {
    pub path: String,
    pub change: ChangeType,
    /// 变更前的值（Added 时为 null）
    pub left: Option<Value>,
    /// 变更后的值（Removed 时为 null）
    pub right: Option<Value>,
    /// 嵌套子节点
    pub children: Vec<DiffNode>,
}

/// 递归比对两个 JSON 值，返回完整 diff 树（含未变更节点）。
pub fn diff_json(left: &Value, right: &Value) -> DiffNode {
    diff_at("$", left, right).unwrap_or_else(|| DiffNode {
        path: "$".to_string(),
        change: ChangeType::Modified,
        left: Some(left.clone()),
        right: Some(right.clone()),
        children: vec![],
    })
}

/// 比对 path 处的两个值。None 表示该处无任何变更。
fn diff_at(path: &str, left: &Value, right: &Value) -> Option<DiffNode> {
    match (left, right) {
        (Value::Object(l), Value::Object(r)) => {
            let mut keys: Vec<&String> = l.keys().chain(r.keys()).collect();
            keys.sort();
            keys.dedup();
            let mut children = Vec::new();
            for k in keys {
                let child_path = format!("{}.{}", path, k);
                match (l.get(k), r.get(k)) {
                    (Some(lv), Some(rv)) => {
                        if let Some(node) = diff_at(&child_path, lv, rv) {
                            children.push(node);
                        }
                    }
                    (Some(lv), None) => children.push(DiffNode {
                        path: child_path,
                        change: ChangeType::Removed,
                        left: Some(lv.clone()),
                        right: None,
                        children: vec![],
                    }),
                    (None, Some(rv)) => children.push(DiffNode {
                        path: child_path,
                        change: ChangeType::Added,
                        left: None,
                        right: Some(rv.clone()),
                        children: vec![],
                    }),
                    (None, None) => unreachable!(),
                }
            }
            if children.is_empty() {
                None
            } else {
                Some(DiffNode {
                    path: path.to_string(),
                    change: ChangeType::Modified,
                    left: Some(left.clone()),
                    right: Some(right.clone()),
                    children,
                })
            }
        }
        (Value::Array(l), Value::Array(r)) => {
            let len = l.len().max(r.len());
            let mut children = Vec::new();
            for i in 0..len {
                let child_path = format!("{}[{}]", path, i);
                match (l.get(i), r.get(i)) {
                    (Some(lv), Some(rv)) => {
                        if let Some(node) = diff_at(&child_path, lv, rv) {
                            children.push(node);
                        }
                    }
                    (Some(lv), None) => children.push(DiffNode {
                        path: child_path,
                        change: ChangeType::Removed,
                        left: Some(lv.clone()),
                        right: None,
                        children: vec![],
                    }),
                    (None, Some(rv)) => children.push(DiffNode {
                        path: child_path,
                        change: ChangeType::Added,
                        left: None,
                        right: Some(rv.clone()),
                        children: vec![],
                    }),
                    (None, None) => unreachable!(),
                }
            }
            if children.is_empty() {
                None
            } else {
                Some(DiffNode {
                    path: path.to_string(),
                    change: ChangeType::Modified,
                    left: Some(left.clone()),
                    right: Some(right.clone()),
                    children,
                })
            }
        }
        _ => {
            if left == right {
                None
            } else {
                Some(DiffNode {
                    path: path.to_string(),
                    change: ChangeType::Modified,
                    left: Some(left.clone()),
                    right: Some(right.clone()),
                    children: vec![],
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn identical_objects_have_no_change_nodes() {
        let l = json!({"a":1,"b":{"c":2}});
        let r = json!({"a":1,"b":{"c":2}});
        let d = diff_json(&l, &r);
        assert!(d.children.is_empty());
    }

    #[test]
    fn scalar_value_changed() {
        let l = json!({"a":1});
        let r = json!({"a":2});
        let d = diff_json(&l, &r);
        assert_eq!(d.children.len(), 1);
        let a = &d.children[0];
        assert_eq!(a.path, "$.a");
        assert_eq!(a.change, ChangeType::Modified);
        assert_eq!(a.left, Some(json!(1)));
        assert_eq!(a.right, Some(json!(2)));
    }

    #[test]
    fn key_added_and_removed() {
        let l = json!({"a":1,"b":2});
        let r = json!({"a":1,"c":3});
        let d = diff_json(&l, &r);
        let changes: Vec<_> = d.children.iter().map(|c| (c.path.clone(), c.change)).collect();
        assert!(changes.contains(&("$.b".to_string(), ChangeType::Removed)));
        assert!(changes.contains(&("$.c".to_string(), ChangeType::Added)));
    }

    #[test]
    fn nested_object_change_paths() {
        let l = json!({"a":{"b":{"c":1}}});
        let r = json!({"a":{"b":{"c":2}}});
        let d = diff_json(&l, &r);
        let a = &d.children[0];
        assert_eq!(a.path, "$.a");
        let b = &a.children[0];
        assert_eq!(b.path, "$.a.b");
        let c = &b.children[0];
        assert_eq!(c.path, "$.a.b.c");
        assert_eq!(c.change, ChangeType::Modified);
    }

    #[test]
    fn array_element_change() {
        let l = json!([1, 2, 3]);
        let r = json!([1, 9, 3]);
        let d = diff_json(&l, &r);
        let changed: Vec<_> = d
            .children
            .iter()
            .filter(|c| c.change == ChangeType::Modified && c.children.is_empty())
            .collect();
        assert_eq!(changed.len(), 1);
        assert_eq!(changed[0].path, "$[1]");
        assert_eq!(changed[0].right, Some(json!(9)));
    }

    #[test]
    fn array_length_changed() {
        let l = json!([1, 2]);
        let r = json!([1, 2, 3]);
        let d = diff_json(&l, &r);
        let added: Vec<_> = d.children.iter().filter(|c| c.change == ChangeType::Added).collect();
        assert_eq!(added.len(), 1);
        assert_eq!(added[0].path, "$[2]");
        assert_eq!(added[0].right, Some(json!(3)));
    }
}
