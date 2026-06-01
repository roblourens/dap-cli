use std::thread;
use std::time::Duration;

fn main() {
    let left = 19;
    let right = 23;
    thread::sleep(Duration::from_secs(2));
    let answer = left + right;
    println!("answer: {answer}");
}