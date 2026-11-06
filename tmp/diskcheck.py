import shutil, os
t, u, f = shutil.disk_usage(os.getcwd())
print("cwd", os.getcwd())
print("total_gb", round(t / 2**30, 2))
print("used_gb", round(u / 2**30, 2))
print("free_gb", round(f / 2**30, 2))
