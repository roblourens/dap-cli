use std::thread;
use std::time::Duration;

fn main() {
    println!("simple-rust-attach ready");
    loop {
        let left = 7;
        let right = 8;
        let answer = left + right;
        println!("tick: {answer}");
        thread::sleep(Duration::from_millis(500));
    }
}